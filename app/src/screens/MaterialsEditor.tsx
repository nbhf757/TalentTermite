// Materials and recipes for the bill of materials (admins only; RLS allows writes for admins).
// A recipe says how much of each material one unit of a price item uses, plus any per-job amount.
// Seeded recipes start as DRAFT; ticking "Confirmed" tells the office the quantities are right.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Material = { id: string; name: string; unit: string; unit_cost: number | null; supplier: string | null; active: boolean; sort_order: number };
type Item = { id: string; section: string; name: string; unit: string };
type RecipeRow = { material_id: string; qty_per_unit: string; fixed_qty: string };
type Recipes = Record<string, { rows: RecipeRow[]; draft: boolean }>;
const UNIT: Record<string, string> = { each: 'each', lf: 'lf', sf: 'sq ft', hour: 'hour', lump: 'job' };
const n = (s: string) => (s.trim() === '' ? 0 : Number(s));

export default function MaterialsEditor({ onClose }: { onClose: () => void }) {
  const [mats, setMats] = useState<Material[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [recipes, setRecipes] = useState<Recipes>({});
  const [matEdits, setMatEdits] = useState<Record<string, Partial<Material>>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [m, i, r] = await Promise.all([
      supabase!.from('materials').select('id,name,unit,unit_cost,supplier,active,sort_order').order('sort_order'),
      supabase!.from('price_items').select('id,section,name,unit').eq('active', true).neq('section', 'recurring').order('section').order('sort_order'),
      supabase!.from('price_item_recipe').select('price_item_id,material_id,qty_per_unit,fixed_qty,draft'),
    ]);
    const err = m.error ?? i.error ?? r.error;
    if (err) { setMsg(err.message); return; }
    setMats(m.data as Material[]); setItems(i.data as Item[]);
    const rec: Recipes = {};
    for (const x of r.data as { price_item_id: string; material_id: string; qty_per_unit: number; fixed_qty: number; draft: boolean }[]) {
      const e = rec[x.price_item_id] ??= { rows: [], draft: false };
      e.rows.push({ material_id: x.material_id, qty_per_unit: String(Number(x.qty_per_unit)), fixed_qty: String(Number(x.fixed_qty)) });
      e.draft = e.draft || x.draft;
    }
    setRecipes(rec); setDirty(new Set()); setMatEdits({});
  };
  useEffect(() => { load(); }, []);

  const matVal = <K extends keyof Material>(m: Material, k: K) => (k in (matEdits[m.id] ?? {}) ? matEdits[m.id][k] : m[k]) as Material[K];
  const setMat = (m: Material, k: keyof Material, v: unknown) => setMatEdits(e => ({ ...e, [m.id]: { ...e[m.id], [k]: v } }));
  const touch = (id: string) => setDirty(d => new Set(d).add(id));
  const setRecipe = (id: string, f: (r: { rows: RecipeRow[]; draft: boolean }) => { rows: RecipeRow[]; draft: boolean }) => {
    setRecipes(r => ({ ...r, [id]: f(r[id] ?? { rows: [], draft: true }) })); touch(id);
  };
  const changes = Object.keys(matEdits).length + dirty.size;

  const save = async () => {
    setBusy(true); setMsg('');
    try {
      for (const [id, e] of Object.entries(matEdits)) {
        const u: Record<string, unknown> = { ...e };
        if ('unit_cost' in u) {
          const c = String(u.unit_cost ?? '').replace(/[$,]/g, '').trim();
          if (c !== '' && !(Number(c) >= 0)) throw new Error(`"${u.unit_cost}" is not a cost.`);
          u.unit_cost = c === '' ? null : Number(c);
        }
        if ('supplier' in u) u.supplier = String(u.supplier ?? '').trim() || null;
        const { error } = await supabase!.from('materials').update(u).eq('id', id);
        if (error) throw new Error(error.message);
      }
      for (const id of dirty) {
        const r = recipes[id] ?? { rows: [], draft: true };
        const rows = r.rows.filter(x => x.material_id);
        for (const x of rows) if (!(n(x.qty_per_unit) >= 0 && n(x.fixed_qty) >= 0)) throw new Error(`${items.find(i => i.id === id)?.name}: amounts must be numbers.`);
        if (new Set(rows.map(x => x.material_id)).size !== rows.length) throw new Error(`${items.find(i => i.id === id)?.name}: a material is listed twice.`);
        const del = await supabase!.from('price_item_recipe').delete().eq('price_item_id', id);
        if (del.error) throw new Error(del.error.message);
        if (rows.length) {
          const ins = await supabase!.from('price_item_recipe').insert(rows.map(x => ({
            price_item_id: id, material_id: x.material_id, qty_per_unit: n(x.qty_per_unit), fixed_qty: n(x.fixed_qty), draft: r.draft,
          })));
          if (ins.error) throw new Error(ins.error.message);
        }
      }
      await load(); setMsg('Saved. The next signed job uses these amounts.');
    } catch (e) { setMsg(`Not saved: ${(e as Error).message}`); }
    setBusy(false);
  };

  const addMaterial = async () => {
    const name = prompt('Material name (include the size you buy, e.g. "2 x 6 x 12 treated lumber")')?.trim();
    if (!name) return;
    const unit = prompt('Unit you order it in (each, roll, box, bag, sheet…)', 'each')?.trim() || 'each';
    const { error } = await supabase!.from('materials').insert({ name, unit, sort_order: (mats[mats.length - 1]?.sort_order ?? 0) + 10 });
    if (error) setMsg(error.message); else load();
  };

  const shown = useMemo(() => items.filter(i => !filter || i.name.toLowerCase().includes(filter.toLowerCase())), [items, filter]);
  const drafts = items.filter(i => recipes[i.id]?.draft).length;

  return (
    <div className="screen">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Materials</h2>
        <button onClick={() => { if (!changes || confirm('Discard unsaved changes?')) onClose(); }}>Done</button>
      </div>
      <p className="muted small">
        When a proposal is signed, these amounts turn into a materials list for Lindsey and the office. Amounts round up to whole units.
        {drafts > 0 && <> <strong className="warn-text">{drafts} item{drafts === 1 ? ' still has' : 's still have'} DRAFT amounts.</strong> Check them and tick Confirmed.</>}
      </p>

      <section className="card">
        <h3>What one unit of each item uses</h3>
        <input placeholder="Find an item" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
        {shown.map(i => {
          const r = recipes[i.id];
          return (
            <details key={i.id} className={`recipe${dirty.has(i.id) ? ' dirty' : ''}`}>
              <summary>
                <strong>{i.name}</strong>{' '}
                <span className="small muted">{r?.rows.length ? `${r.rows.length} material${r.rows.length === 1 ? '' : 's'}` : 'no materials'}</span>
                {r?.draft && <span className="draft-tag">DRAFT</span>}
              </summary>
              {(r?.rows ?? []).map((x, k) => (
                <div key={k} className="recipe-row">
                  <select value={x.material_id} onChange={e => setRecipe(i.id, o => ({ ...o, rows: o.rows.map((y, j) => j === k ? { ...y, material_id: e.target.value } : y) }))}>
                    <option value="">Pick a material…</option>
                    {mats.filter(m => m.active || m.id === x.material_id).map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                  </select>
                  <label className="small">per {UNIT[i.unit] ?? i.unit}
                    <input inputMode="decimal" value={x.qty_per_unit} onChange={e => setRecipe(i.id, o => ({ ...o, rows: o.rows.map((y, j) => j === k ? { ...y, qty_per_unit: e.target.value } : y) }))} />
                    {n(x.qty_per_unit) > 0 && n(x.qty_per_unit) < 1 && <span className="recipe-hint">1 per {Math.round(1 / n(x.qty_per_unit)).toLocaleString()} {UNIT[i.unit] ?? i.unit}</span>}
                  </label>
                  <label className="small">per job
                    <input inputMode="decimal" value={x.fixed_qty} onChange={e => setRecipe(i.id, o => ({ ...o, rows: o.rows.map((y, j) => j === k ? { ...y, fixed_qty: e.target.value } : y) }))} />
                  </label>
                  <button className="link" onClick={() => setRecipe(i.id, o => ({ ...o, rows: o.rows.filter((_, j) => j !== k) }))}>Remove</button>
                </div>
              ))}
              <div className="row-between small">
                <button onClick={() => setRecipe(i.id, o => ({ ...o, rows: [...o.rows, { material_id: '', qty_per_unit: '0', fixed_qty: '0' }] }))}>Add material</button>
                <label><input type="checkbox" checked={!!r && !r.draft} onChange={e => setRecipe(i.id, o => ({ ...o, draft: !e.target.checked }))} /> Confirmed</label>
              </div>
            </details>
          );
        })}
      </section>

      <section className="card">
        <div className="row-between"><h3>Material list</h3><button onClick={addMaterial}>Add material</button></div>
        <p className="muted small">Cost is optional. When every material on a job has a cost, the list shows an estimated material cost.</p>
        {mats.map(m => (
          <div key={m.id} className={`mat-row${matEdits[m.id] ? ' dirty' : ''}`}>
            <input value={matVal(m, 'name')} onChange={e => setMat(m, 'name', e.target.value)} />
            <input className="short" value={matVal(m, 'unit')} onChange={e => setMat(m, 'unit', e.target.value)} />
            <input className="short" inputMode="decimal" placeholder="$ cost" value={String(matVal(m, 'unit_cost') ?? '')} onChange={e => setMat(m, 'unit_cost', e.target.value)} />
            <input className="short" placeholder="Supplier" value={matVal(m, 'supplier') ?? ''} onChange={e => setMat(m, 'supplier', e.target.value)} />
            <label className="small"><input type="checkbox" checked={matVal(m, 'active')} onChange={e => setMat(m, 'active', e.target.checked)} /> Used</label>
          </div>
        ))}
      </section>

      <div className="save-bar">
        {msg && <span className="small">{msg}</span>}
        <button className="primary" disabled={!changes || busy} onClick={save}>{busy ? 'Saving…' : changes ? `Save ${changes} change${changes === 1 ? '' : 's'}` : 'No changes'}</button>
      </div>
    </div>
  );
}
