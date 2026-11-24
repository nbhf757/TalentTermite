import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export const ALLOWED_DOMAIN = '@talenttermite.com';
export const isAllowedEmail = (e?: string | null) => !!e && e.toLowerCase().endsWith(ALLOWED_DOMAIN);

/** The saved login: undefined while checking, null when signed out. Works offline once signed in. */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

/** Signs the rep in with email + password. Accounts are created by an admin in Supabase. */
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!supabase) return;
    if (!isAllowedEmail(email.trim())) { setErr(`Use your ${ALLOWED_DOMAIN} email.`); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(navigator.onLine ? 'That email and password did not match.' : "You're offline. Sign in when you have signal.");
  };
  return (
    <section className="card signin">
      <h3>Sign in</h3>
      <div className="form-grid">
        <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password}
          onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} /></label>
      </div>
      {err && <p className="warn small">{err}</p>}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" disabled={busy || !email || !password} onClick={submit}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </div>
    </section>
  );
}
