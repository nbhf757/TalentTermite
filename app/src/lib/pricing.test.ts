import { describe, expect, it } from 'vitest';
import { defaultQty, discountStatus, downPayment, lineTotal, quote, recurringSummary, type PriceItem } from './pricing';

const item = (p: Partial<PriceItem>): PriceItem => ({
  id: 'x', section: 'moisture', name: 'x', unit: 'sf', qty_source: 'manual',
  waste_factor: 1, unit_price: 1, min_price: null, initial_price: null, ...p,
});

const totals = { perimeterLf: 164, interiorSf: 1320, atticSf: 1405 };

describe('pricing', () => {
  it('quantities come from the drawing', () => {
    expect(defaultQty(item({ qty_source: 'interior_sf', waste_factor: 1.1 }), totals)).toBe(1452);
    expect(defaultQty(item({ qty_source: 'perimeter_lf' }), totals)).toBe(164);
    expect(defaultQty(item({ qty_source: 'attic_sf' }), totals)).toBe(1405);
    expect(defaultQty(item({ qty_source: 'manual' }), totals)).toBe(1);
  });

  it('minimums apply (Termidor $8.65/lf, min $425)', () => {
    const termidor = item({ section: 'pest', unit: 'lf', unit_price: 8.65, min_price: 425 });
    expect(lineTotal({ item: termidor, qty: 40 })).toBe(425);
    expect(lineTotal({ item: termidor, qty: 164 })).toBe(1418.6);
  });

  it('recurring services charge the initial on the proposal', () => {
    const plus = item({ section: 'recurring', unit: 'each', unit_price: 69, initial_price: 250 });
    expect(lineTotal({ item: plus, qty: 1 })).toBe(250);
  });

  it('discount rules: 5% rep, >5% manager flag, 10% approval, >10% blocked', () => {
    expect(discountStatus(0)).toBe('none');
    expect(discountStatus(5)).toBe('ok');
    expect(discountStatus(7.5)).toBe('manager_flag');
    expect(discountStatus(10)).toBe('needs_approval');
    expect(discountStatus(12)).toBe('over_max');
  });

  it('jobs over $4,000 require 25% down', () => {
    const vb = item({ unit_price: 3.8 });
    const q = quote([{ item: vb, qty: 1452 }], 0);
    expect(q.total).toBe(5517.6);
    expect(q.requiredDownPct).toBe(25);
    expect(q.requiredDown).toBe(1379.4);
    expect(quote([{ item: vb, qty: 100 }], 0).requiredDownPct).toBe(0);
  });

  it('down payment: dollars or percent, and checks the minimum', () => {
    expect(downPayment(8000, { pct: 25 })).toEqual({ amount: 2000, pct: 25, balance: 6000, belowRequired: false });
    expect(downPayment(8000, { amount: 1000 }, 2000)).toEqual({ amount: 1000, pct: 12.5, balance: 7000, belowRequired: true });
  });
});

describe('recurringSummary', () => {
  it('groups ongoing charges by interval', () => {
    expect(recurringSummary([
      { recurring_price: 99, recurring_interval: 'month' },
      { recurring_price: 30, recurring_interval: 'month' },
      { recurring_price: 175, recurring_interval: 'year' },
      { recurring_price: null, recurring_interval: null },
    ])).toEqual({ month: 129, year: 175 });
  });
});
