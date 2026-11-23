import { useMemo, useState } from 'react';
import type { Totals } from '../lib/footprint';
import type { BookItem, PriceBook } from '../lib/priceBook';
import {
  defaultQty, DISCOUNT_ABSOLUTE_MAX, downPayment, lineTotal, quote, recurringSummary,
} from '../lib/pricing';
import type { Suggestion } from '../lib/suggestions';
import { DUMPSTER, TOP_DOWN_SUBFLOOR, VARIANTS } from '../lib/variants';
import { buildPackages, defaultPackaging, PACKAGE_DEFS, type PackageKey, type Packaging } from '../lib/packages';

export type WorkLine = { key: string; itemId: string; qty: number | null; note?: string; variant?: string }; // qty null = follow the drawing
export type Work = { lines: WorkLine[]; discountPct: number; approver: string; down: { amount?: number; pct?: number }; packaging?: Packaging; topDownAck?: boolean };
export const emptyWork = (): Work => ({ lines: [], discountPct: 0, approver: '', down: {}, packaging: defaultPackaging() });

const GROUPS: { key: string; title: string; sections: BookItem['section'][] }[] = [
  { key: 'foundation', title: 'Foundation', sections: ['foundation'] },
  { key: 'moisture', title: 'Moisture', sections: ['moisture'] },
  { key: 'pest', title: 'Pest', sections: ['pest', 'attic'] },
  { key: 'recurring', title: 'Ongoing services', sections: ['recurring'] },
];
const APPROVERS = ['John Tessier', 'Ian Shiner', 'Nathan Bullock'];
const INTERVAL: Record<string, string> = { month: '/mo', quarter: '/qtr', year: '/yr', service: '/service' };
const $ = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function WorkScreen({ book, totals, suggestions, work, onChange }: {
  book: PriceBook; totals: Totals; suggestions: Suggestion[]; work: Work; onChange: (w: Work) => void;
}) {
  const byId = useMemo(() => new Map(book.items.map(i => [i.id, i])), [book]);
  const byName = useMemo(() => new Map(book.items.map(i => [i.name, i])), [book]);
  const [picker, setPicker] = useState<Record<string, string>>({});

  const lines = work.lines.flatMap(l => {
    const item = byId.get(l.itemId);
    if (!item) return [];
    const qty = l.qty ?? defaultQty(item, totals);
    return [{ ...l, item, qty, total: lineTotal({ item, qty }) }];
  });
  const q = quote(lines.map(l => ({ item: l.item, qty: l.qty })), work.discountPct);
  const dp = downPayment(q.total, work.down, q.requiredDown);
  const ongoing = recurringSummary(lines.map(l => l.item));

  const set = (patch: Partial<Work>) => onChange({ ...work, ...patch });
  const addItem = (item: BookItem) => {
    if (work.lines.some(l => l.itemId === item.id)) return;
    set({ lines: [...work.lines, { key: crypto.randomUUID(), itemId: item.id, qty: null }] });
  };
  const patchLine = (key: string, p: Partial<WorkLine>) => set({ lines: work.lines.map(l => (l.key === key ? { ...l, ...p } : l)) });

  const pending = suggestions.filter(s => s.itemNames.some(n => { const i = byName.get(n); return i && !work.lines.some(l => l.itemId === i.id); }) || (!s.itemNames.length && s.note));

  return (
    <div className="screen">
      <h2>Recommended work</h2>
      {book.source !== 'live' && (
        <p className="muted small">Using {book.source === 'cache' ? `saved prices from ${new Date(book.loadedAt!).toLocaleDateString()}` : 'built-in prices (Sept 2025 sheet)'}. They refresh when you're signed in and online.</p>
      )}

      {pending.length > 0 && (
        <section className="card suggest">
          <h3>From the inspection</h3>
          {pending.map(s => (
            <div key={s.point} className="suggest-row">
              <span>{s.reason}{s.note ? ` (${s.note})` : ''}</span>
              <span className="chips">
                {s.itemNames.map(n => byName.get(n)).filter((i): i is BookItem => !!i && !work.lines.some(l => l.itemId === i.id))
                  .map(i => <button key={i.id} className="chip" onClick={() => addItem(i)}>+ {i.name}</button>)}
              </span>
            </div>
          ))}
        </section>
      )}

      {GROUPS.map(g => {
        const gl = lines.filter(l => g.sections.includes(l.item.section));
        const options = book.items.filter(i => g.sections.includes(i.section) && !work.lines.some(l => l.itemId === i.id));
        return (
          <section key={g.key} className="card">
            <h3>{g.title}</h3>
            {gl.map(l => (
              <div key={l.key} className="line">
                <div className="line-name">
                  {l.item.name}
                  {l.item.rep_notes && <div className="muted small">{l.item.rep_notes}</div>}
                </div>
                {g.key === 'recurring' ? (
                  <div className="line-qty muted small">
                    {l.item.initial_price != null && <>Initial {$(l.item.initial_price)}<br /></>}
                    {l.item.recurring_price != null && <>{$(l.item.recurring_price)}{INTERVAL[l.item.recurring_interval ?? ''] ?? ''}</>}
                  </div>
                ) : (
                  <label className="line-qty">{l.item.unit === 'lump' ? 'qty' : l.item.unit}
                    <input inputMode="decimal" value={l.qty} onChange={e => patchLine(l.key, { qty: e.target.value === '' ? null : Number(e.target.value) })} />
                  </label>
                )}
                {VARIANTS[l.item.name] && (
                  <select value={l.variant ?? VARIANTS[l.item.name][0].key} onChange={e => patchLine(l.key, { variant: e.target.value })}>
                    {VARIANTS[l.item.name].map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                  </select>
                )}
                <strong className="line-total">{$(l.total)}</strong>
                <button className="x" title="Remove" onClick={() => set({ lines: work.lines.filter(x => x.key !== l.key) })}>×</button>
              </div>
            ))}
            <div className="row add-line">
              <select value={picker[g.key] ?? ''} onChange={e => setPicker({ ...picker, [g.key]: e.target.value })}>
                <option value="">Add {g.title.toLowerCase()} item…</option>
                {options.map(i => <option key={i.id} value={i.id}>{i.name} ({$(i.section === 'recurring' ? (i.initial_price ?? i.recurring_price ?? 0) : i.unit_price)}{i.unit !== 'each' && i.unit !== 'lump' && i.section !== 'recurring' ? '/' + i.unit : ''})</option>)}
              </select>
              <button disabled={!picker[g.key]} onClick={() => { const i = byId.get(picker[g.key]); if (i) addItem(i); setPicker({ ...picker, [g.key]: '' }); }}>Add</button>
            </div>
          </section>
        );
      })}

      {lines.length > 0 && (() => {
        const pk = work.packaging ?? defaultPackaging();
        const setPk = (patch: Partial<Packaging>) => set({ packaging: { ...pk, ...patch } });
        const packages = buildPackages(lines, pk); // lines carry variant
        return (
          <section className="card">
            <h3>Packages the customer will see</h3>
            <p className="muted small">Work is bundled automatically. The proposal shows what each package includes, not a price per item.</p>
            {packages.map(p => (
              <div key={p.key} className="pkg-edit">
                <input className="pkg-name" value={pk.names[p.key] ?? p.name}
                  onChange={e => setPk({ names: { ...pk.names, [p.key]: e.target.value } })} />
                {p.lines.map(l => (
                  <div key={l.key} className="pkg-line">
                    <span>{l.item.name}</span>
                    <select value={p.key} onChange={e => setPk({ moves: { ...pk.moves, [l.key]: e.target.value as PackageKey } })}>
                      {(Object.keys(PACKAGE_DEFS) as PackageKey[]).map(k => <option key={k} value={k}>{PACKAGE_DEFS[k].name.replace(' Package', '')}</option>)}
                    </select>
                  </div>
                ))}
                {pk.showPackagePrices && <div className="small"><strong>{$(p.price)}</strong></div>}
              </div>
            ))}
            <label className="check small"><input type="checkbox" checked={pk.combineWater} onChange={e => setPk({ combineWater: e.target.checked })} />
              Combine water management with moisture control</label>
            <label className="check small"><input type="checkbox" checked={pk.showPackagePrices} onChange={e => setPk({ showPackagePrices: e.target.checked })} />
              Show a price for each package (otherwise one total)</label>
          </section>
        );
      })()}

      {lines.some(l => l.item.name === TOP_DOWN_SUBFLOOR) && (
        <section className="card flag">
          <h3>Top-down subfloor</h3>
          <p className="small">Make sure demo is covered and the dumpster fee is included. The proposal tells the customer they are responsible for replacing the finished flooring.</p>
          {!lines.some(l => l.item.name === DUMPSTER) && byName.get(DUMPSTER) && (
            <button className="chip" onClick={() => addItem(byName.get(DUMPSTER)!)}>+ {DUMPSTER}</button>
          )}
          <label className="check small"><input type="checkbox" checked={!!work.topDownAck} onChange={e => set({ topDownAck: e.target.checked })} />
            Demo and dumpster are covered, and I told the customer about the flooring</label>
        </section>
      )}

      <section className="card summary">
        <div className="sum-row"><span>Subtotal</span><span>{$(q.subtotal)}</span></div>
        <div className="sum-row">
          <label className="inline">Discount %
            <input inputMode="decimal" value={work.discountPct || ''} onChange={e => set({ discountPct: Math.min(Number(e.target.value) || 0, 100) })} />
          </label>
          <span>−{$(q.discountAmount)}</span>
        </div>
        {q.discountStatus === 'manager_flag' && <p className="warn">Over 5%: your manager will be flagged.</p>}
        {q.discountStatus === 'needs_approval' && (
          <label className="block warn">10% needs approval from
            <select value={work.approver} onChange={e => set({ approver: e.target.value })}>
              <option value="">Choose…</option>{APPROVERS.map(a => <option key={a}>{a}</option>)}
            </select>
          </label>
        )}
        {q.discountStatus === 'over_max' && <p className="warn">The most you can discount is {DISCOUNT_ABSOLUTE_MAX}%.</p>}
        <div className="sum-row total"><span>Total</span><span>{$(q.total)}</span></div>
        {Object.entries(ongoing).map(([k, v]) => (
          <div key={k} className="sum-row muted"><span>Ongoing after the job</span><span>{$(v)}{INTERVAL[k]}</span></div>
        ))}

        <h3>Down payment</h3>
        {q.requiredDownPct > 0 && <p className="small">Jobs over $4,000 need {q.requiredDownPct}% down ({$(q.requiredDown)}).</p>}
        <div className="row">
          <label>Amount ($)
            <input inputMode="decimal" value={work.down.amount ?? (work.down.pct != null ? dp.amount : '')}
              onChange={e => set({ down: e.target.value === '' ? {} : { amount: Number(e.target.value) } })} />
          </label>
          <label>or Percent (%)
            <input inputMode="decimal" value={work.down.pct ?? (work.down.amount != null ? dp.pct : '')}
              onChange={e => set({ down: e.target.value === '' ? {} : { pct: Number(e.target.value) } })} />
          </label>
          <button onClick={() => set({ down: { pct: q.requiredDownPct || 25 } })}>Use {q.requiredDownPct || 25}%</button>
        </div>
        <div className="sum-row"><span>Balance due at completion</span><span>{$(dp.balance)}</span></div>
        {dp.belowRequired && <p className="warn">Down payment is below the required {$(q.requiredDown)}.</p>}
      </section>
    </div>
  );
}

export function workIsSellable(work: Work, book: PriceBook, totals: Totals) {
  const byId = new Map(book.items.map(i => [i.id, i]));
  const lines = work.lines.flatMap(l => { const item = byId.get(l.itemId); return item ? [{ item, qty: l.qty ?? defaultQty(item, totals) }] : []; });
  const q = quote(lines, work.discountPct);
  const dp = downPayment(q.total, work.down, q.requiredDown);
  const problems: string[] = [];
  if (!lines.length) problems.push('Add at least one item.');
  if (q.discountStatus === 'over_max') problems.push(`Discount is over ${DISCOUNT_ABSOLUTE_MAX}%.`);
  if (q.discountStatus === 'needs_approval' && !work.approver) problems.push('Choose who approved the 10% discount.');
  if (dp.belowRequired) problems.push('Down payment is below the required amount.');
  if (lines.some(l => l.item.name === TOP_DOWN_SUBFLOOR) && !work.topDownAck) problems.push('Confirm demo, dumpster, and flooring notice for the top-down subfloor.');
  return { quote: q, down: dp, problems };
}
