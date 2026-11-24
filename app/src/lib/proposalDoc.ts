// The signed proposal as plain text blocks, built from the same inputs as the Proposal screen.
// The server renders these blocks into the PDF the customer receives, so the PDF says what the screen said.
import type { Totals } from './footprint';
import type { PriceBook } from './priceBook';
import { defaultQty, lineTotal, recurringSummary } from './pricing';
import type { Suggestion } from './suggestions';
import { COMPANY, DRYING_WOOD_TERM, FINANCING, INTRO, NOTICES, TERMS_DRAFT, WARRANTY } from './terms';
import { buildPackages, defaultPackaging } from './packages';
import { workIsSellable, type Work } from '../screens/WorkScreen';
import { encapsulationIncludes, isEncapsulation } from './variants';
import { FINANCING_QR } from './financingQr';
import { BRANDS, type Brand, type Customer } from '../screens/CustomerScreen';

export type PaymentMethod = '' | 'check_cash' | 'card' | 'finance_sac' | 'finance_5yr';
export const METHOD_LABEL: Record<Exclude<PaymentMethod, ''>, string> = {
  check_cash: 'Check or cash', card: 'Card (FieldRoutes Payments)',
  finance_sac: FINANCING.sameAsCash, finance_5yr: FINANCING.fiveYear,
};

export type DocBlock =
  | { kind: 'h'; text: string }          // section heading
  | { kind: 'sub'; text: string }        // package title
  | { kind: 'p'; text: string }
  | { kind: 'small'; text: string }
  | { kind: 'li'; text: string }
  | { kind: 'row'; text: string; right: string; bold?: boolean }
  | { kind: 'qr'; text: string; png: string };   // base64 PNG with a caption

export type ProposalDoc = {
  brand: string; company: typeof COMPANY;
  customerLines: string[];               // name, address, phone/email
  date: string; blocks: DocBlock[];
};

export const INTERVAL: Record<string, string> = { month: 'per month', quarter: 'per quarter', year: 'per year', service: 'per service' };
export const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export type ProposalInput = {
  brand: Brand; customer: Customer; book: PriceBook; totals: Totals; work: Work;
  suggestions: Suggestion[]; comments: string; method: PaymentMethod;
};

/** Everything the screen and the PDF both need. */
export function proposalView({ book, totals, work }: Pick<ProposalInput, 'book' | 'totals' | 'work'>) {
  const byId = new Map(book.items.map(i => [i.id, i]));
  const lines = work.lines.flatMap(l => {
    const item = byId.get(l.itemId); if (!item) return [];
    const qty = l.qty ?? defaultQty(item, totals);
    return [{ key: l.key, item, qty, variant: l.variant }];
  });
  const packaging = work.packaging ?? defaultPackaging();
  const packages = buildPackages(lines, packaging);
  const { quote, down, problems } = workIsSellable(work, book, totals);
  const ongoing = recurringSummary(lines.map(l => l.item));
  const hasAprilaire = lines.some(l => /^(Dehumidifier|Full Encapsulation)/.test(l.item.name));
  const terms = [...TERMS_DRAFT, ...(hasAprilaire ? [DRYING_WOOD_TERM] : [])];
  return { lines, packaging, packages, quote, down, problems, ongoing, hasAprilaire, terms };
}

/** Package price for the customer: "$979.00 to start + $99.00 per month", or just the one price when nothing recurs. */
export function packagePriceText(p: { price: number; recurring: Record<string, number> }) {
  const ongoing = Object.entries(p.recurring).map(([k, amt]) => `${money(amt)} ${INTERVAL[k] ?? ''}`.trim());
  if (!ongoing.length) return money(p.price);
  return p.price > 0 ? `${money(p.price)} to start + ${ongoing.join(' + ')}` : ongoing.join(' + ');
}

/** Label for the total: when there is ongoing service, say the total is only what is due for the work itself. */
export const totalLabel = (ongoing: Record<string, number>) => Object.keys(ongoing).length ? 'Total Investment (one-time and start-up)' : 'Total Investment';
export const ONGOING_LABEL = 'Plus ongoing service';

export function recurringNote(item: { initial_price: number | null; recurring_price: number | null; recurring_interval: string | null }) {
  if (item.recurring_price == null) return '';
  return `${item.initial_price != null ? `${money(item.initial_price)} to start, then ` : ''}${money(item.recurring_price)} ${INTERVAL[item.recurring_interval ?? ''] ?? ''}`.trim();
}

export function buildProposalDoc(input: ProposalInput, now = new Date()): ProposalDoc {
  const { customer: c, suggestions, comments, totals, method } = input;
  const v = proposalView(input);
  const b: DocBlock[] = [];

  b.push({ kind: 'p', text: INTRO });
  if (suggestions.length) {
    b.push({ kind: 'h', text: 'What we found' });
    for (const s of suggestions) b.push({ kind: 'li', text: `${s.reason}${s.note ? `: ${s.note.toLowerCase()}` : ''}` });
  }
  if (comments.trim()) b.push({ kind: 'p', text: comments.trim() });
  if (totals.perimeterLf > 0) {
    b.push({ kind: 'small', text: `Measured: ${totals.exteriorLf} lf exterior perimeter, ${totals.perimeterLf} lf foundation wall, ${totals.interiorSf} sq ft crawlspace${totals.atticSf ? `, ${totals.atticSf} sq ft attic` : ''}.` });
  }

  b.push({ kind: 'h', text: 'Your recommended plan' });
  for (const p of v.packages) {
    b.push({ kind: 'sub', text: v.packaging.showPackagePrices ? `${p.name}  ${packagePriceText(p)}` : p.name });
    b.push({ kind: 'small', text: p.pitch });
    p.lines.forEach((l, i) => {
      const note = recurringNote(l.item);
      b.push({ kind: 'li', text: p.scope[i] + (note ? ` (${note})` : '') });
      if (isEncapsulation(l.item.name)) b.push({ kind: 'small', text: encapsulationIncludes(input.work.ventCount) });
    });
    if (p.warranties.length) b.push({ kind: 'small', text: `Includes: ${p.warranties.join(' · ')}` });
  }
  const q = v.quote;
  if (q.discountAmount > 0) {
    b.push({ kind: 'row', text: 'Plan value', right: money(q.subtotal) });
    b.push({ kind: 'row', text: `${input.work.military ? 'Military discount' : 'Discount'} (${q.discountPct}%)`, right: `-${money(q.discountAmount)}` });
  }
  b.push({ kind: 'row', text: totalLabel(v.ongoing), right: money(q.total), bold: true });
  for (const [k, amt] of Object.entries(v.ongoing)) b.push({ kind: 'row', text: ONGOING_LABEL, right: `${money(amt)} ${INTERVAL[k]}` });
  if (v.down.amount > 0) {
    b.push({ kind: 'row', text: `Down payment (${v.down.pct}%)`, right: money(v.down.amount) });
    b.push({ kind: 'row', text: 'Balance at completion', right: money(v.down.balance) });
  }

  b.push({ kind: 'h', text: 'Your protection' });
  b.push({ kind: 'li', text: WARRANTY.workmanship });
  if (v.hasAprilaire) b.push({ kind: 'li', text: WARRANTY.aprilaire });
  b.push({ kind: 'li', text: `Licensed and insured. ${COMPANY.license}.` });
  for (const n of NOTICES) b.push({ kind: 'small', text: n });

  b.push({ kind: 'h', text: 'Payment' });
  b.push({ kind: 'p', text: method ? METHOD_LABEL[method] : 'Not chosen' });
  if (method.startsWith('finance')) b.push({ kind: 'small', text: FINANCING.note });
  b.push({ kind: 'small', text: `Financing available through Regions Bank. ${FINANCING.apply}` });
  for (const qr of FINANCING_QR) b.push({ kind: 'qr', text: qr.label, png: qr.png });
  b.push({ kind: 'small', text: '*Subject to credit approval.' });

  b.push({ kind: 'h', text: 'Terms' });
  for (const t of v.terms) b.push({ kind: 'small', text: `${t.title}. ${t.text}` });

  const contact = [c.phone, c.email].filter(Boolean).join(' · ');
  return {
    brand: BRANDS[input.brand], company: COMPANY,
    customerLines: [
      `${c.first_name} ${c.last_name}`.trim() + (c.company ? `, ${c.company}` : ''),
      `${c.address}${c.city ? `, ${c.city}` : ''} ${c.state} ${c.zip}`.trim(),
      ...(contact ? [contact] : []),
    ],
    date: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    blocks: b,
  };
}

/** Lines as saved to proposal_lines (prices kept for the office, never shown to the customer). */
export function savedLines(input: Pick<ProposalInput, 'book' | 'totals' | 'work'>) {
  const v = proposalView(input);
  const pkgOf = new Map(v.packages.flatMap(p => p.lines.map((l, i) => [l.key, { name: p.name, scope: p.scope[i] }] as const)));
  return v.lines.map((l, i) => ({
    price_item_id: /^[0-9a-f-]{36}$/.test(l.item.id) ? l.item.id : null,
    section: l.item.section, name: l.item.name + (l.variant ? ` (${l.variant})` : ''),
    description: pkgOf.get(l.key)?.scope ?? l.item.description,
    qty: l.qty, unit: l.item.unit, unit_price: l.item.unit_price,
    line_total: lineTotal({ item: l.item, qty: l.qty }),
    option_group: pkgOf.get(l.key)?.name ?? null, sort_order: i,
  }));
}
