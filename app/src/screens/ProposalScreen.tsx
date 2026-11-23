import type { Totals } from '../lib/footprint';
import type { PriceBook } from '../lib/priceBook';
import { defaultQty, recurringSummary } from '../lib/pricing';
import type { Suggestion } from '../lib/suggestions';
import { COMPANY, FINANCING, INTRO, NOTICES, TERMS_DRAFT, WARRANTY } from '../lib/terms';
import SignaturePad from '../components/SignaturePad';
import { buildPackages, defaultPackaging } from '../lib/packages';
import { BRANDS, customerReady, type Brand, type Customer } from './CustomerScreen';
import { workIsSellable, type Work } from './WorkScreen';

export type PaymentMethod = '' | 'check_cash' | 'card' | 'finance_sac' | 'finance_5yr';
export type Signoff = { method: PaymentMethod; customerSig: string | null; repSig: string | null; signedAt: string | null };
export const emptySignoff = (): Signoff => ({ method: '', customerSig: null, repSig: null, signedAt: null });

const METHODS: [PaymentMethod, string][] = [
  ['check_cash', 'Check or cash'], ['card', 'Card (FieldRoutes Payments)'],
  ['finance_sac', FINANCING.sameAsCash], ['finance_5yr', FINANCING.fiveYear],
];
const INTERVAL: Record<string, string> = { month: 'per month', quarter: 'per quarter', year: 'per year', service: 'per service' };
const $ = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function ProposalScreen({ brand, customer, book, totals, work, suggestions, comments, signoff, onSignoff }: {
  brand: Brand; customer: Customer; book: PriceBook; totals: Totals; work: Work; suggestions: Suggestion[];
  comments: string; signoff: Signoff; onSignoff: (s: Signoff) => void;
}) {
  const byId = new Map(book.items.map(i => [i.id, i]));
  const lines = work.lines.flatMap(l => {
    const item = byId.get(l.itemId); if (!item) return [];
    const qty = l.qty ?? defaultQty(item, totals);
    return [{ key: l.key, item, qty }];
  });
  const packaging = work.packaging ?? defaultPackaging();
  const packages = buildPackages(lines, packaging);
  const { quote: q, down, problems } = workIsSellable(work, book, totals);
  const ongoing = recurringSummary(lines.map(l => l.item));
  const hasAprilaire = lines.some(l => /^(Dehumidifier|Full Encapsulation)/.test(l.item.name));

  const blockers = [...problems];
  if (!customerReady(customer)) blockers.unshift('Finish the customer details.');
  if (!signoff.method) blockers.push('Choose a payment method.');
  const set = (p: Partial<Signoff>) => onSignoff({ ...signoff, ...p });
  const canSign = blockers.length === 0;
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
        {totals.perimeterLf > 0 && <p className="muted small">Measured: {totals.perimeterLf} lf foundation wall, {totals.interiorSf} sq ft crawlspace{totals.atticSf ? `, ${totals.atticSf} sq ft attic` : ''}.</p>}
      </section>

      <section className="card">
        <h3>Your recommended plan</h3>
        {packages.map(p => (
          <div key={p.key} className="pkg">
            <div className="pkg-head">
              <span className="pkg-title">{p.name}</span>
              {packaging.showPackagePrices && <span className="pkg-price">{$(p.price)}</span>}
            </div>
            <div className="muted small">{p.pitch}</div>
            <ul className="pkg-scope">
              {p.lines.map((l, i) => (
                <li key={l.key}>{p.scope[i]}
                  {l.item.recurring_price != null && <span className="muted"> ({l.item.initial_price != null ? `${$(l.item.initial_price)} to start, then ` : ''}{$(l.item.recurring_price)} {INTERVAL[l.item.recurring_interval ?? ''] ?? ''}{l.item.recurring_interval === 'month' && /^Talent /.test(l.item.name) ? ', quarterly service with unlimited call-backs' : ''})</span>}
                </li>
              ))}
            </ul>
            {p.warranties.length > 0 && <div className="pkg-warranty small">Includes: {p.warranties.join(' · ')}</div>}
          </div>
        ))}
        <div className="summary">
          {q.discountAmount > 0 && <div className="sum-row"><span>Plan value</span><span>{$(q.subtotal)}</span></div>}
          {q.discountAmount > 0 && <div className="sum-row"><span>Discount ({q.discountPct}%)</span><span>−{$(q.discountAmount)}</span></div>}
          <div className="sum-row total"><span>Total</span><span>{$(q.total)}</span></div>
          {Object.entries(ongoing).map(([k, v]) => <div key={k} className="sum-row muted"><span>Ongoing</span><span>{$(v)} {INTERVAL[k]}</span></div>)}
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
        {signoff.method.startsWith('finance') && <p className="small">{FINANCING.note} The office will send the EnerBank application. Work is scheduled after approval.</p>}
        {signoff.method === 'card' && <p className="small muted">The card is entered on FieldRoutes' secure form. Talent never sees or stores the card number.</p>}
      </section>

      <section className="card">
        <h3>Terms <span className="draft-tag">DRAFT wording, needs approval</span></h3>
        {TERMS_DRAFT.map(t => <p key={t.title} className="small"><strong>{t.title}.</strong> {t.text}</p>)}
      </section>

      <section className="card">
        <h3>Accept and sign</h3>
        {!canSign && <ul className="warn small">{blockers.map(b => <li key={b}>{b}</li>)}</ul>}
        {canSign && !signed && (<>
          <SignaturePad label={`Customer: ${customer.first_name} ${customer.last_name}`} value={signoff.customerSig} onChange={v => set({ customerSig: v })} />
          <SignaturePad label="Talent representative" value={signoff.repSig} onChange={v => set({ repSig: v })} />
          <button className="primary wide" disabled={!signoff.customerSig || !signoff.repSig} onClick={() => set({ signedAt: new Date().toISOString() })}>
            Accept and sign
          </button>
        </>)}
        {signed && (
          <p><strong>Signed {new Date(signoff.signedAt!).toLocaleString()}.</strong> A copy will be emailed to you, and our office will contact you to schedule.</p>
        )}
      </section>
      <p className="muted small center">Questions? Call us at {COMPANY.phone} | {COMPANY.email}</p>
    </div>
  );
}
