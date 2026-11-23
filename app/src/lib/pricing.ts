// Pricing rules for a proposal. Pure functions so they run the same offline and on the server.
import type { Totals } from './footprint';

export type PriceItem = {
  id: string;
  section: 'foundation' | 'moisture' | 'pest' | 'attic' | 'recurring';
  name: string;
  unit: 'each' | 'lf' | 'sf' | 'hour' | 'lump';
  qty_source: 'perimeter_lf' | 'interior_sf' | 'attic_sf' | 'manual' | null;
  waste_factor: number;
  unit_price: number;
  min_price: number | null;
  initial_price: number | null;
};

export type Line = { item: PriceItem; qty: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Default quantity for an item, taken from the drawing totals. Manual items start at 1. */
export function defaultQty(item: PriceItem, t: Totals): number {
  const wf = item.waste_factor || 1;
  switch (item.qty_source) {
    case 'perimeter_lf': return r2(t.perimeterLf * wf);
    case 'interior_sf': return r2(t.interiorSf * wf);
    case 'attic_sf': return r2(t.atticSf * wf);
    default: return 1;
  }
}

/** Line total: qty x unit price, never below the item's minimum. Recurring items charge the initial here. */
export function lineTotal(l: Line): number {
  if (l.item.section === 'recurring') return r2(l.item.initial_price ?? 0);
  const raw = l.qty * l.item.unit_price;
  return r2(l.item.min_price != null ? Math.max(raw, l.item.min_price) : raw);
}

export type DiscountStatus = 'none' | 'ok' | 'manager_flag' | 'needs_approval' | 'over_max';

export const DISCOUNT_REP_MAX = 5;      // up to 5%: rep decides
export const DISCOUNT_ABSOLUTE_MAX = 10; // 10% is the floor; needs John, Ian or Nathan

/**
 * Discount rules (Nathan, 2026-11-23): up to 5% the rep decides; over 5% flags the manager;
 * 10% is the maximum and needs John, Ian or Nathan to approve; above 10% is not allowed.
 */
export function discountStatus(pct: number): DiscountStatus {
  if (pct <= 0) return 'none';
  if (pct <= DISCOUNT_REP_MAX) return 'ok';
  if (pct < DISCOUNT_ABSOLUTE_MAX) return 'manager_flag';
  if (pct === DISCOUNT_ABSOLUTE_MAX) return 'needs_approval';
  return 'over_max';
}

export const DEPOSIT_THRESHOLD = 4000;
export const DEPOSIT_PCT = 25;

export type Quote = {
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  total: number;
  discountStatus: DiscountStatus;
  requiredDownPct: number;   // 25% on jobs over $4,000, else 0
  requiredDown: number;
};

export function quote(lines: Line[], discountPct: number): Quote {
  const subtotal = r2(lines.reduce((s, l) => s + lineTotal(l), 0));
  const pct = Math.max(0, discountPct);
  const discountAmount = r2(subtotal * pct / 100);
  const total = r2(subtotal - discountAmount);
  const requiredDownPct = total > DEPOSIT_THRESHOLD ? DEPOSIT_PCT : 0;
  return {
    subtotal, discountPct: pct, discountAmount, total,
    discountStatus: discountStatus(pct),
    requiredDownPct,
    requiredDown: r2(total * requiredDownPct / 100),
  };
}

/** Down payment entered as dollars or percent; the other is filled in. Never below the required amount. */
export function downPayment(total: number, input: { amount?: number; pct?: number }, requiredDown = 0) {
  let amount = input.amount ?? (input.pct != null ? total * input.pct / 100 : 0);
  amount = r2(Math.min(Math.max(amount, 0), total));
  const pct = total > 0 ? r2(amount / total * 100) : 0;
  return { amount, pct, balance: r2(total - amount), belowRequired: amount < requiredDown };
}

/** Ongoing charges after the job, grouped by billing interval, e.g. { month: 99, year: 175 }. */
export function recurringSummary(items: { recurring_price: number | null; recurring_interval: string | null }[]) {
  const out: Record<string, number> = {};
  for (const i of items) {
    if (i.recurring_price == null || !i.recurring_interval) continue;
    out[i.recurring_interval] = r2((out[i.recurring_interval] ?? 0) + i.recurring_price);
  }
  return out;
}
