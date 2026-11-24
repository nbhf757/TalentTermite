// Customer-facing page from the "Review and sign" email link (/?sign=<token>). No login: the token is the key.
// Shows the saved proposal exactly as the PDF says it, lets the customer pick how to pay, type their name and sign.
import { useEffect, useState } from 'react';
import SignaturePad from '../components/SignaturePad';
import { METHOD_LABEL, type DocBlock, type PaymentMethod, type ProposalDoc } from '../lib/proposalDoc';
import { supabase } from '../lib/supabase';

type View =
  | { state: 'loading' }
  | { state: 'error'; message: string; reload?: boolean }
  | { state: 'open'; number: number; doc: ProposalDoc; updated_at: string; customer_name: string; rep_name: string; payment_method: PaymentMethod; portal_url: string | null }
  | { state: 'signed'; number: number; brand?: string; phone?: string; emailed?: boolean; card?: boolean; portal_url?: string | null };

async function call(body: Record<string, unknown>) {
  if (!supabase) throw new Error('This page is not connected. Please call us.');
  const { data, error } = await supabase.functions.invoke('submit-proposal', { body });
  if (error) {
    let msg = 'Something went wrong. Please try again, or call us.', reload = false;
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) { msg = b.error; reload = !!b.reload; } } catch { /* keep */ }
    const e = new Error(msg) as Error & { reload?: boolean }; e.reload = reload; throw e;
  }
  return data;
}

const METHODS = Object.entries(METHOD_LABEL) as [Exclude<PaymentMethod, ''>, string][];

function Block({ b }: { b: DocBlock }) {
  switch (b.kind) {
    case 'h': return <h3>{b.text}</h3>;
    case 'sub': return <h4 style={{ margin: '10px 0 4px' }}>{b.text}</h4>;
    case 'p': return <p>{b.text}</p>;
    case 'small': return <p className="small muted">{b.text}</p>;
    case 'li': return <li>{b.text}</li>;
    case 'row': return <div className="row-between" style={{ fontWeight: b.bold ? 700 : 400 }}><span>{b.text}</span><span>{b.right}</span></div>;
    case 'qr': return <figure className="qr"><img src={`data:image/png;base64,${b.png}`} alt={b.text} width={130} height={130} /><figcaption className="small">{b.text}</figcaption></figure>;
  }
}

/** Groups the blocks into cards at each heading, and runs of QR codes into one row. */
function DocView({ doc }: { doc: ProposalDoc }) {
  const groups: DocBlock[][] = [];
  for (const b of doc.blocks) { if (b.kind === 'h' || !groups.length) groups.push([]); groups[groups.length - 1].push(b); }
  return <>{groups.map((g, gi) => {
    const out: React.ReactNode[] = [];
    for (let i = 0; i < g.length; i++) {
      if (g[i].kind === 'qr') { const run: DocBlock[] = []; while (g[i]?.kind === 'qr') run.push(g[i++]); i--; out.push(<div key={i} className="qr-row">{run.map((b, k) => <Block key={k} b={b} />)}</div>); }
      else if (g[i].kind === 'li') { const run: DocBlock[] = []; while (g[i]?.kind === 'li') run.push(g[i++]); i--; out.push(<ul key={i}>{run.map((b, k) => <Block key={k} b={b} />)}</ul>); }
      else out.push(<Block key={i} b={g[i]} />);
    }
    return <section key={gi} className="card">{out}</section>;
  })}</>;
}

export default function CustomerSign({ token }: { token: string }) {
  const [view, setView] = useState<View>({ state: 'loading' });
  const [method, setMethod] = useState<PaymentMethod>('');
  const [name, setName] = useState('');
  const [sig, setSig] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => {
    setView({ state: 'loading' }); setMsg('');
    call({ action: 'view', token }).then(d => {
      if (d.signed) setView({ state: 'signed', number: d.number, brand: d.brand, phone: d.phone });
      else { setView({ state: 'open', ...d }); setMethod(m => m || d.payment_method || ''); setName(n => n || d.customer_name || ''); }
    }).catch((e: Error & { reload?: boolean }) => setView({ state: 'error', message: e.message }));
  };
  useEffect(load, [token]);

  const sign = async () => {
    if (view.state !== 'open') return;
    setBusy(true); setMsg('');
    try {
      const d = await call({ action: 'sign', token, updated_at: view.updated_at, name, signature: sig, method, agree });
      setView({ state: 'signed', ...d });
      window.scrollTo(0, 0);
    } catch (e) {
      const err = e as Error & { reload?: boolean };
      if (err.reload) setView({ state: 'error', message: err.message, reload: true }); else setMsg(err.message);
    }
    setBusy(false);
  };

  const brand = view.state === 'open' ? view.doc.brand : view.state === 'signed' ? view.brand : undefined;
  return (
    <div className="app">
      <header className="topbar"><span className="brand">{brand ?? 'Talent'}</span><span className="sub">Your proposal</span></header>
      <div className="screen">
        {view.state === 'loading' && <p className="muted">Loading your proposal…</p>}
        {view.state === 'error' && <section className="card"><p className="warn">{view.message}</p>{view.reload && <button className="primary" onClick={load}>Reload</button>}</section>}
        {view.state === 'signed' && (
          <section className="card">
            <h3>Thank you! Proposal #{view.number} is signed.</h3>
            <p>{view.emailed === false ? 'Our office has your signed copy and will send it to you.' : view.emailed ? 'A signed copy is on its way to your email.' : ''} Our office will contact you to schedule.</p>
            {view.card && (<>
              <p><strong>Next step: add your card.</strong> Sign in to your customer portal and add your card under billing. We never see or store your card number.</p>
              {view.portal_url && <a className="button primary" href={view.portal_url} target="_blank" rel="noopener noreferrer">Open customer portal</a>}
            </>)}
            {view.phone && <p className="small muted">Questions? Call us at {view.phone}.</p>}
          </section>
        )}
        {view.state === 'open' && (<>
          <section className="card">
            <h3>Proposal #{view.number}</h3>
            <p className="small muted">{view.doc.customerLines.join(' · ')}<br />Prepared by {view.rep_name} · {view.doc.date}</p>
          </section>
          <DocView doc={view.doc} />
          <section className="card">
            <h3>How would you like to pay?</h3>
            <div className="chips">
              {METHODS.map(([m, label]) => <button key={m} className={method === m ? 'opt active' : 'opt'} onClick={() => setMethod(m)}>{label}</button>)}
            </div>
            {method === 'card' && <p className="small muted">After you sign, you will add your card in your customer portal (FieldRoutes' secure site). We never see or store your card number.</p>}
            {method.startsWith('finance') && <p className="small muted">Use the QR code above to apply. Approval is needed before we schedule.</p>}
          </section>
          <section className="card">
            <h3>Accept and sign</h3>
            <label className="block">Your full name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
            <SignaturePad label="Sign here with your finger or mouse" value={sig} onChange={setSig} />
            <label className="check small" style={{ gap: 8, margin: '10px 0' }}>
              <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
              I have read this proposal and its terms, I accept it, and I agree that my electronic signature is the same as signing on paper.
            </label>
            {msg && <p className="warn small">{msg}</p>}
            <button className="primary wide" disabled={busy || !method || !sig || !agree || name.trim().length < 3} onClick={sign}>{busy ? 'Saving…' : 'Accept and sign'}</button>
            {!method && <p className="small muted">Choose how you would like to pay first.</p>}
          </section>
          <p className="muted small center">Questions? Call us at {view.doc.company.phone} | {view.doc.company.email}</p>
        </>)}
      </div>
    </div>
  );
}
