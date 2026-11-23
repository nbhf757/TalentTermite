// Price book editor for admins (Nathan, John). Saves straight to Supabase; RLS allows writes for admins only.
// Each rep's device picks up new prices the next time it loads them online.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Row = {
  id: string; section: string; name: string; unit: string; description: string | null; rep_notes: string | null;
  unit_price: number; min_price: number | null; initial_price: number | null; recurring_price: number | null;
  recurring_interval: string | null; active: boolean; sort_order: number; updated_at: string;
};
export const EDITABLE_FIELDS = ['unit_price', 'min_price', 'initial_price', 'recurring_price', 'description', 'rep_notes', 'active'] as const;
type Field = (typeof EDITABLE_FIELDS)[number];
const SECTIONS: [string, string][] = [['foundation', 'Foundation'], ['moisture', 'Moisture'], ['pest', 'Pest'], ['attic', 'Attic'], ['recurring', 'Ongoing plans']];
const UNIT: Record<string, string> = { each: 'each', lf: 'per lf', sf: 'per sq ft', hour: 'per hour', lump: 'flat' };

export default function PriceEditor({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [edits, setEdits] = useState<Record<string, Partial<Row>>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  const load = async () => {
    const { data, error } = await supabase!.from('price_items')
      .select('id,section,name,unit,description,rep_notes,unit_price,min_price,initial_price,recurring_price,recurring_interval,active,sort_order,updated_at')
      .order('section').order('sort_order');
    if (error) setMsg(error.message); else setRows(data as Row[]);
  };
  useEffect(() => { load(); }, []);

  const val = (r: Row, f: Field) => (f in (edits[r.id] ?? {}) ? edits[r.id][f] : r[f]);
  const set = (r: Row, f: Field, v: unknown) => setEdits(e => ({ ...e, [r.id]: { ...e[r.id], [f]: v } }));
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[$,]/g, '')));
  const changed = Object.keys(edits).filter(id => {
    const r = rows.find(x => x.id === id)!;
    return Object.entries(edits[id]).some(([f, v]) => String(r[f as Field] ?? '') !== String(v ?? ''));
  });

  const NUMS = ['unit_price', 'min_price', 'initial_price', 'recurring_price'] as const;
  const save = async () => {
    const updates: Record<string, Record<string, unknown>> = {};
    for (const id of changed) {
      const u: Record<string, unknown> = { ...edits[id] };
      for (const f of NUMS) if (f in u) {
        const n = num(String(u[f] ?? ''));
        if (n != null && !(n >= 0)) { setMsg(`${rows.find(r => r.id === id)!.name}: "${u[f]}" is not a price.`); return; }
        if (f === 'unit_price' && n == null) { setMsg(`${rows.find(r => r.id === id)!.name} needs a price.`); return; }
        u[f] = n;
      }
      updates[id] = u;
    }
    setBusy(true); setMsg('');
    for (const id of changed) {
      const { error } = await supabase!.from('price_items').update({ ...updates[id], updated_at: new Date().toISOString() }).eq('id', id);
      if (error) { setBusy(false); setMsg(`Not saved: ${error.message}`); return; }
    }
    setEdits({}); await load(); setBusy(false);
    setMsg(`Saved ${changed.length} item${changed.length === 1 ? '' : 's'}. Reps get the new prices next time their app loads online.`);
  };

  const shown = useMemo(() => rows.filter(r => !filter || r.name.toLowerCase().includes(filter.toLowerCase())), [rows, filter]);

  return (
    <div className="screen">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Price book</h2>
        <button onClick={() => { if (!changed.length || confirm('Discard unsaved price changes?')) onClose(); }}>Done</button>
      </div>
      <p className="muted small">Prices are never shown per item to customers; they set the package totals. Blank minimum = no minimum.</p>
      <input placeholder="Find an item" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
      {SECTIONS.map(([key, title]) => {
        const items = shown.filter(r => r.section === key);
        if (!items.length) return null;
        return (
          <section key={key} className="card">
            <h3>{title}</h3>
            {items.map(r => (
              <div key={r.id} className={`price-row${changed.includes(r.id) ? ' dirty' : ''}`}>
                <div className="price-name">
                  <strong>{r.name}</strong> <span className="muted small">{UNIT[r.unit] ?? r.unit}</span>
                  <label className="small muted" style={{ float: 'right' }}>
                    <input type="checkbox" checked={!!val(r, 'active')} onChange={e => set(r, 'active', e.target.checked)} /> Offered
                  </label>
                </div>
                <div className="form-grid">
                  {r.section === 'recurring' ? (<>
                    <label>Initial $<input inputMode="decimal" value={String(val(r, 'initial_price') ?? '')} onChange={e => set(r, 'initial_price', e.target.value)} /></label>
                    <label>Recurring $ ({r.recurring_interval})<input inputMode="decimal" value={String(val(r, 'recurring_price') ?? '')} onChange={e => set(r, 'recurring_price', e.target.value)} /></label>
                  </>) : (<>
                    <label>Price $<input inputMode="decimal" value={String(val(r, 'unit_price') ?? '')} onChange={e => set(r, 'unit_price', e.target.value)} /></label>
                    <label>Minimum $<input inputMode="decimal" value={String(val(r, 'min_price') ?? '')} onChange={e => set(r, 'min_price', e.target.value)} /></label>
                  </>)}
                </div>
                <details className="small">
                  <summary>Customer wording and rep notes</summary>
                  <label>What the customer sees<textarea rows={3} value={(val(r, 'description') as string) ?? ''} onChange={e => set(r, 'description', e.target.value || null)} /></label>
                  <label>Note for reps<textarea rows={2} value={(val(r, 'rep_notes') as string) ?? ''} onChange={e => set(r, 'rep_notes', e.target.value || null)} /></label>
                </details>
              </div>
            ))}
          </section>
        );
      })}
      <div className="save-bar">
        {msg && <span className="small">{msg}</span>}
        <button className="primary" disabled={!changed.length || busy} onClick={save}>
          {busy ? 'Saving…' : changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'No changes'}
        </button>
      </div>
    </div>
  );
}
