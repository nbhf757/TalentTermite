import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/** Signs the rep in with email + password. Accounts are created by an admin in Supabase. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

export default function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!supabase) return;
    setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(navigator.onLine ? 'That email and password did not match.' : "You're offline. Sign in when you have signal.");
    else onDone();
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
        <button onClick={onDone}>Cancel</button>
      </div>
    </section>
  );
}
