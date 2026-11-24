import type { Totals } from '../lib/footprint';
import type { PriceBook } from '../lib/priceBook';
import type { Suggestion } from '../lib/suggestions';
import { COMPANY, FINANCING, INTRO, NOTICES, WARRANTY } from '../lib/terms';
import SignaturePad from '../components/SignaturePad';
import PortalSteps from '../components/PortalSteps';
import { INTERVAL, METHOD_LABEL, ONGOING_LABEL, money as $, packagePriceText, proposalView, recurringNote, totalLabel, type PaymentMethod } from '../lib/proposalDoc';
import { BRANDS, customerReady, type Brand, type Customer } from './CustomerScreen';
import type { Work } from './WorkScreen';
import { commentsMissing, type Answers } from '../lib/inspection';
import { encapsulationIncludes, isEncapsulation } from '../lib/variants';
import { FINANCING_QR } from '../lib/financingQr';
import { usePortalUrl } from '../lib/portal';

export type { PaymentMethod };
export type SaveState =
  | { status: 'waiting'; note?: string }                        // signed, not on the server yet
  | { status: 'sending' }
  | { status: 'saved'; number: number; emailed: boolean; emailNote?: string; frNote?: string; frTasks?: number; frDoc?: boolean };
export type Signoff = {
  method: PaymentMethod; customerSig: string | null; repSig: string | null; signedAt: string | null;
  clientRef?: string; save?: SaveState;
  unsigned?: { status: 'sending'; email?: boolean } | { status: 'saved'; number: number; at: string; frNote?: string; frDoc?: boolean; emailedTo?: string; emailNote?: string } | { status: 'error'; note: string };
};
export const emptySignoff = (): Signoff => ({ method: '', customerSig: null, repSig: null, signedAt: null });

const METHODS = Object.entries(METHOD_LABEL) as [Exclude<PaymentMethod, ''>, string][];

export default function ProposalScreen({ brand, customer, book, totals, work, suggestions, answers, comments, signoff, onSignoff, onRetry, onSaveUnsigned }: {
  brand: Brand; customer: Customer; book: PriceBook; totals: Totals; work: Work; suggestions: Suggestion[]; answers: Answers;
  comments: string; signoff: Signoff; onSignoff: (s: Signoff) => void; onRetry: () => void; onSaveUnsigned: (emailToSign?: boolean) => void;
}) {
  const { packaging, packages, quote: q, down, problems, ongoing, hasAprilaire, terms } = proposalView({ book, totals, work });
  const portal = usePortalUrl();
  const blockers = [...problems];
  if (!customerReady(customer)) blockers.unshift('Finish the customer details.');
  if (commentsMissing(answers)) blockers.push('Add a note under each inspection finding marked in orange.');
  if (!signoff.method) blockers.push('Choose a payment method.');
  const set = (p: Partial<Signoff>) => onSignoff({ ...signoff, ...p });
  const canSign = blockers.length === 0;
  // Emailing to sign later: everything but the payment choice, which the customer makes online.
  const emailBlock = !customer.email ? 'Add the customer\'s email to send it to them.' : blockers.find(b => b !== 'Choose a payment method.');
  const signed = !!signoff.signedAt;

  return (
    <div className="screen proposal">
      <header className="prop-head card">
        <div>
          <div className="prop-brand">{BRANDS[brand]}</div>
          <div className="muted small">{COMPANY.address} · {COMPANY.license}</div>
        </div>
        <div className="prop-meta small">
          <div>Prepared for <strong>{customer.first_name} {customer.last_name}</strong></div>
          <div>{customer.address}{customer.city ? `, ${customer.city}` : ''} {customer.state} {customer.zip}</div>
          <div>{new Date().toLocaleDateString()}</div>
        </div>
      </header>

      <section className="card">
        <p>{INTRO}</p>
        {suggestions.length > 0 && (<>
          <h3>What we found</h3>
          <ul>{suggestions.map(s => <li key={s.point}>{s.reason}{s.note ? `: ${s.note.toLowerCase()}` : ''}</li>)}</ul>
        </>)}
        {comments && <p className="muted">{comments}</p>}
        {totals.perimeterLf > 0 && <p className="muted small">Measured: {totals.exteriorLf} lf exterior perimeter, {totals.perimeterLf} lf foundation wall, {totals.interiorSf} sq ft crawlspace{totals.atticSf ? `, ${totals.atticSf} sq ft attic` : ''}.</p>}
      </section>

      <section className="card">
        <h3>Your recommended plan</h3>
        {packages.map(p => (
          <div key={p.key} className="pkg">
            <div className="pkg-head">
              <span className="pkg-title">{p.name}</span>
              {packaging.showPackagePrices && <span className="pkg-price">{packagePriceText(p)}</span>}
            </div>
            <div className="muted small">{p.pitch}</div>
            <ul className="pkg-scope">
              {p.lines.map((l, i) => (
                <li key={l.key}>{p.scope[i]}
                  {l.item.recurring_price != null && <span className="muted"> ({recurringNote(l.item)})</span>}
                  {isEncapsulation(l.item.name) && <div className="muted small">{encapsulationIncludes(work.ventCount)}</div>}
                </li>
              ))}
            </ul>
            {p.warranties.length > 0 && <div className="pkg-warranty small">Includes: {p.warranties.join(' · ')}</div>}
          </div>
        ))}
        <div className="summary">
          {q.discountAmount > 0 && <div className="sum-row"><span>Plan value</span><span>{$(q.subtotal)}</span></div>}
          {q.discountAmount > 0 && <div className="sum-row"><span>{work.military ? 'Military discount' : 'Discount'} ({q.discountPct}%)</span><span>−{$(q.discountAmount)}</span></div>}
          <div className="sum-row total"><span>{totalLabel(ongoing)}</span><span>{$(q.total)}</span></div>
          {Object.entries(ongoing).map(([k, v]) => <div key={k} className="sum-row muted"><span>{ONGOING_LABEL}</span><span>{$(v)} {INTERVAL[k]}</span></div>)}
          {down.amount > 0 && <div className="sum-row"><span>Down payment ({down.pct}%)</span><span>{$(down.amount)}</span></div>}
          {down.amount > 0 && <div className="sum-row"><span>Balance at completion</span><span>{$(down.balance)}</span></div>}
        </div>
      </section>

      <section className="card">
        <h3>Your protection</h3>
        <ul>
          <li>{WARRANTY.workmanship}</li>
          {hasAprilaire && <li>{WARRANTY.aprilaire}</li>}
          <li>Licensed and insured. {COMPANY.license}.</li>
        </ul>
        {NOTICES.map(n => <p key={n} className="notice">{n}</p>)}
      </section>

      <section className="card">
        <h3>Payment</h3>
        <div className="chips">
          {METHODS.map(([m, label]) => (
            <button key={m} disabled={signed} className={signoff.method === m ? 'opt active' : 'opt'} onClick={() => set({ method: m })}>{label}</button>
          ))}
        </div>
        {signoff.method.startsWith('finance') && <p className="small">{FINANCING.note}</p>}
        <div className="financing">
          <p className="small"><strong>Financing available through Regions Bank.</strong> {FINANCING.apply}</p>
          <div className="qr-row">
            {FINANCING_QR.map(qr => (
              <figure key={qr.code} className="qr">
                <img src={`data:image/png;base64,${qr.png}`} alt={`QR code to prequalify, ${qr.label}`} width={140} height={140} />
                <figcaption className="small">{qr.label}</figcaption>
              </figure>
            ))}
          </div>
          <p className="muted small">*Subject to credit approval.</p>
        </div>
        {signoff.method === 'card' && <p className="small muted">After signing, the card goes into your Talent customer portal (FieldRoutes' secure site). Talent never sees or stores the card number.</p>}
      </section>

      <section className="card">
        <h3>Terms <span className="draft-tag">DRAFT wording, needs approval</span></h3>
        {terms.map(t => <p key={t.title} className="small"><strong>{t.title}.</strong> {t.text}</p>)}
      </section>

      <section className="card">
        <h3>Accept and sign</h3>
        {!canSign && <ul className="warn small">{blockers.map(b => <li key={b}>{b}</li>)}</ul>}
        {canSign && !signed && (<>
          <SignaturePad label={`Customer: ${customer.first_name} ${customer.last_name}`} value={signoff.customerSig} onChange={v => set({ customerSig: v })} />
          <SignaturePad label="Talent representative" value={signoff.repSig} onChange={v => set({ repSig: v })} />
          <button className="primary wide" disabled={!signoff.customerSig || !signoff.repSig} onClick={() => set({ signedAt: new Date().toISOString(), clientRef: signoff.clientRef ?? crypto.randomUUID(), save: { status: 'waiting' } })}>
            Accept and sign
          </button>
        </>)}
        {!signed && <UnsignedSave state={signoff.unsigned} disabled={problems.length > 0 || !customerReady(customer)} onSave={onSaveUnsigned} emailBlock={emailBlock} email={customer.email} />}
        {signed && (<>
          <p><strong>Signed {new Date(signoff.signedAt!).toLocaleString()}.</strong> A copy will be emailed to you, and our office will contact you to schedule.</p>
          <SaveStatus save={signoff.save} email={customer.email} onRetry={onRetry} />
          {signoff.method === 'card' && (
            <div className="financing">
              <p className="small"><strong>Next: add your card in the customer portal.</strong> {customer.email ? 'The link is also in your emailed copy.' : 'Our office can also take it by phone.'}</p>
              {portal && <PortalSteps portal={portal} account={customer.fr_customer_id} />}
              {portal
                ? <a className="button primary" href={portal} target="_blank" rel="noopener noreferrer">Open customer portal</a>
                : <p className="small muted">Rep: the portal link isn't set up in the app yet. Help the customer sign in to the portal, or the office will call for the card.</p>}
            </div>
          )}
        </>)}
      </section>
      <p className="muted small center">Questions? Call us at {COMPANY.phone} | {COMPANY.email}</p>
    </div>
  );
}

/** Rep-facing: whether the signed proposal reached the office. */
function SaveStatus({ save, email, onRetry }: { save?: SaveState; email: string; onRetry: () => void }) {
  if (!save) return null;
  if (save.status === 'sending') return <p className="small muted">Sending to the office…</p>;
  if (save.status === 'saved') return (
    <p className="small ok">
      Saved as proposal #{save.number}.{' '}
      {save.emailed ? `PDF emailed to ${email}.` : save.emailNote ?? 'PDF saved; no customer email was sent.'}
      {save.frDoc && ' PDF added to the customer in FieldRoutes.'}
      {!!save.frTasks && ` Scheduling task sent to the office (${save.frTasks}).`}
      {save.frNote && <span className="warn"> {save.frNote}</span>}
    </p>
  );
  return (
    <div className="small warn">
      Not sent to the office yet{save.note ? `: ${save.note}` : '.'} It is kept on this device and sends automatically.
      {' '}<button className="link" onClick={onRetry}>Try now</button>
    </div>
  );
}

/** Customer not ready to sign: save to the office as Sent, with a PDF marked Not signed. */
function UnsignedSave({ state, disabled, onSave, emailBlock, email }: { state: Signoff['unsigned']; disabled: boolean; onSave: (emailToSign?: boolean) => void; emailBlock?: string; email: string }) {
  const sending = state?.status === 'sending';
  return (
    <div className="unsigned-save">
      <p className="small muted">Customer wants to think it over?</p>
      <button className="wide" disabled={!!emailBlock || sending}
        onClick={() => { if (window.confirm(`Email this proposal to ${email} so they can review and sign it online?`)) onSave(true); }}>
        {sending && state.email ? 'Sending…' : 'Email to customer to sign later'}
      </button>
      {emailBlock && <p className="small muted">{emailBlock}</p>}
      <button className="wide" disabled={disabled || sending} onClick={() => onSave(false)}>
        {sending && !state.email ? 'Saving…' : state?.status === 'saved' ? 'Save changes (not signed yet)' : 'Save, not signed yet'}
      </button>
      {state?.status === 'saved' && <p className="small ok">Saved as proposal #{state.number} ({new Date(state.at).toLocaleTimeString()}).
        {state.emailedTo && ` Emailed to ${state.emailedTo} with a link to sign online.`}
        {state.frDoc && ' Copy added to the customer in FieldRoutes.'} The customer can still sign here later.
        {state.emailNote && <span className="warn"> {state.emailNote}</span>}
        {state.frNote && <span className="warn"> {state.frNote}</span>}</p>}
      {state?.status === 'error' && <p className="small warn">Not saved: {state.note}</p>}
    </div>
  );
}
