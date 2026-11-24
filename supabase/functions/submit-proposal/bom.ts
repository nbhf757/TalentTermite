// Bill of materials for a sold proposal. Pure (no Deno or network), so the app's tests cover it too.
// Each price item has a recipe: material per unit of the item (qty_per_unit) plus a per-job amount (fixed_qty).
// Needs are added up per material across the job, then rounded up to whole purchase units.

export type Recipe = {
  price_item_id: string; material_id: string; qty_per_unit: number; fixed_qty: number; draft: boolean;
  material: { name: string; unit: string; unit_cost: number | null; supplier: string | null; sort_order: number };
};
export type SoldLine = { price_item_id: string | null; name: string; qty: number };
export type BomRow = {
  material: string; unit: string; need: number; order: number;
  unit_cost: number | null; cost: number | null; supplier: string | null; for_items: string[]; draft: boolean;
};
export type Bom = { rows: BomRow[]; no_recipe: string[]; est_cost: number | null; has_draft: boolean };

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function buildBom(lines: SoldLine[], recipes: Recipe[]): Bom {
  const byItem = new Map<string, Recipe[]>();
  for (const r of recipes) byItem.set(r.price_item_id, [...(byItem.get(r.price_item_id) ?? []), r]);
  const acc = new Map<string, BomRow & { sort: number }>();
  const noRecipe: string[] = [];
  for (const l of lines) {
    const rs = l.price_item_id ? byItem.get(l.price_item_id) : undefined;
    if (!rs?.length) { if (l.qty > 0) noRecipe.push(l.name); continue; }
    if (!(l.qty > 0)) continue;
    for (const r of rs) {
      const need = l.qty * Number(r.qty_per_unit) + Number(r.fixed_qty);
      if (need <= 0) continue;
      const row = acc.get(r.material_id) ?? {
        material: r.material.name, unit: r.material.unit, need: 0, order: 0,
        unit_cost: r.material.unit_cost == null ? null : Number(r.material.unit_cost), cost: null,
        supplier: r.material.supplier, for_items: [], draft: false, sort: r.material.sort_order,
      };
      row.need += need;
      if (!row.for_items.includes(l.name)) row.for_items.push(l.name);
      row.draft = row.draft || r.draft;
      acc.set(r.material_id, row);
    }
  }
  const rows = [...acc.values()].sort((a, b) => a.sort - b.sort).map(({ sort: _s, ...r }) => {
    const order = Math.ceil(round(r.need, 4)); // tiny float noise never adds a whole unit
    return { ...r, need: round(r.need), order, cost: r.unit_cost == null ? null : round(order * r.unit_cost) };
  });
  const priced = rows.filter(r => r.cost != null);
  return {
    rows, no_recipe: noRecipe,
    est_cost: priced.length === rows.length && rows.length ? round(priced.reduce((s, r) => s + r.cost!, 0)) : null,
    has_draft: rows.some(r => r.draft),
  };
}
