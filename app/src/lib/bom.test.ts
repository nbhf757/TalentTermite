import { describe, expect, it } from 'vitest';
import { buildBom, type Recipe } from '../../../supabase/functions/submit-proposal/bom';

const mat = (name: string, sort: number, unit_cost: number | null = null) => ({ name, unit: 'each', unit_cost, supplier: null, sort_order: sort });
const R = (item: string, material: string, per: number, fixed = 0, m = mat(material, 0), draft = false): Recipe =>
  ({ price_item_id: item, material_id: material, qty_per_unit: per, fixed_qty: fixed, draft, material: m });

describe('bill of materials', () => {
  it('adds needs across items and rounds up to whole purchase units', () => {
    const recipes = [
      R('vb', 'roll', 0.000958, 0, mat('10 mil roll', 10, 120)),
      R('vb', 'stakes', 0.000667, 0, mat('Stakes', 20, 15)),
      R('encap', 'dehu', 0, 1, mat('Dehumidifier', 5, 1500)),
      R('dehu', 'dehu', 1, 0, mat('Dehumidifier', 5, 1500)),
    ];
    const bom = buildBom([
      { price_item_id: 'vb', name: 'Vapor barrier', qty: 1800 },
      { price_item_id: 'encap', name: 'Encapsulation', qty: 1800 },
      { price_item_id: 'dehu', name: 'Dehumidifier', qty: 1 },
      { price_item_id: 'x', name: 'Misc Hourly Work', qty: 3 },
      { price_item_id: null, name: 'Custom line', qty: 0 },
    ], recipes);
    expect(bom.rows.map(r => [r.material, r.need, r.order])).toEqual([
      ['Dehumidifier', 2, 2], ['10 mil roll', 1.72, 2], ['Stakes', 1.2, 2],
    ]);
    expect(bom.rows[0].for_items).toEqual(['Encapsulation', 'Dehumidifier']);
    expect(bom.no_recipe).toEqual(['Misc Hourly Work']);
    expect(bom.est_cost).toBe(3000 + 240 + 30);
  });

  it('leaves the cost blank until every material has a price, and flags draft recipes', () => {
    const bom = buildBom([{ price_item_id: 'j', name: 'Floor Joist', qty: 3 }],
      [R('j', 'lumber', 1, 0, mat('2x10', 1, 22), true), R('j', 'screws', 0.2, 0, mat('Screws', 2))]);
    expect(bom.rows.map(r => r.order)).toEqual([3, 1]);
    expect(bom.est_cost).toBeNull();
    expect(bom.has_draft).toBe(true);
  });

  it('does not add a unit for float noise', () => {
    const bom = buildBom([{ price_item_id: 'p', name: 'Top down', qty: 32 }], [R('p', 'ply', 0.03125)]);
    expect(bom.rows[0].order).toBe(1);
  });
});
