import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  computeSection, needsOverrideReview, totals, vertices,
  type AreaType, type Section, type Wall,
} from '../lib/footprint';

const DIRS: { label: string; deg: number }[] = [
  { label: '→', deg: 0 }, { label: '↓', deg: 90 }, { label: '←', deg: 180 }, { label: '↑', deg: 270 },
];
const AREA_TYPES: AreaType[] = ['crawlspace', 'basement', 'slab', 'attic', 'porch', 'other'];

export const newSection = (n: number): Section => ({
  id: crypto.randomUUID(), label: n === 1 ? 'Main house' : `Section ${n}`,
  areaType: 'crawlspace', includeInTotals: true, walls: [],
});

function FootprintSvg({ walls }: { walls: Wall[] }) {
  const pts = vertices(walls);
  if (pts.length < 2) return <div className="svg-empty">Add the first wall to start the drawing.</div>;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 10);
  const pad = span * 0.15;
  const vb = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  const fs = span / 22;
  return (
    <svg viewBox={vb} className="footprint" role="img" aria-label="Foundation footprint">
      <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')} className="fp-fill" />
      {walls.map((w, i) => {
        const a = pts[i], b = pts[i + 1];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        return (
          <g key={i}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="fp-wall" strokeWidth={span / 150} />
            <text x={mx} y={my} fontSize={fs} className="fp-label" textAnchor="middle" dy={-fs / 3}>
              {w.lengthFt}'
            </text>
          </g>
        );
      })}
      <circle cx={0} cy={0} r={span / 80} className="fp-start" />
    </svg>
  );
}

export default function DrawingScreen({ sections, setSections }: {
  sections: Section[]; setSections: Dispatch<SetStateAction<Section[]>>;
}) {
  const [activeId, setActiveId] = useState(sections[0].id);
  const [len, setLen] = useState('');
  const [dir, setDir] = useState(0);

  const active = sections.find(s => s.id === activeId)!;
  const result = useMemo(() => computeSection(active), [active]);
  const sum = useMemo(() => totals(sections), [sections]);

  const update = (patch: Partial<Section>) =>
    setSections(ss => ss.map(s => (s.id === activeId ? { ...s, ...patch } : s)));

  const addWall = () => {
    const n = parseFloat(len);
    if (!(n > 0)) return;
    update({ walls: [...active.walls, { lengthFt: n, dirDeg: dir }] });
    setLen('');
  };

  const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

  return (
    <div className="screen">
      <h2>Foundation drawing</h2>

      <div className="tabs">
        {sections.map(s => (
          <button key={s.id} className={s.id === activeId ? 'tab active' : 'tab'} onClick={() => setActiveId(s.id)}>
            {s.label}
          </button>
        ))}
        <button className="tab add" onClick={() => {
          const s = newSection(sections.length + 1);
          setSections([...sections, s]); setActiveId(s.id);
        }}>+ Section</button>
      </div>

      <div className="row">
        <label>Name <input value={active.label ?? ''} onChange={e => update({ label: e.target.value })} /></label>
        <label>Type
          <select value={active.areaType} onChange={e => update({ areaType: e.target.value as AreaType })}>
            {AREA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={active.includeInTotals} onChange={e => update({ includeInTotals: e.target.checked })} />
          Include in totals
        </label>
      </div>

      <FootprintSvg walls={active.walls} />

      <div className="wall-entry">
        <input inputMode="decimal" placeholder="Length (ft)" value={len}
          onChange={e => setLen(e.target.value)} onKeyDown={e => e.key === 'Enter' && addWall()} />
        {DIRS.map(d => (
          <button key={d.deg} className={dir === d.deg ? 'dir active' : 'dir'} onClick={() => setDir(d.deg)}>{d.label}</button>
        ))}
        <input className="angle" inputMode="numeric" title="Angle (degrees)" value={dir}
          onChange={e => setDir(((Number(e.target.value) || 0) % 360 + 360) % 360)} />
        <button className="primary" onClick={addWall}>Add wall</button>
        <button onClick={() => update({ walls: active.walls.slice(0, -1) })} disabled={!active.walls.length}>Undo</button>
      </div>

      {active.walls.length > 2 && !result.isClosed && (
        <p className="warn">The shape is {result.closureGapFt} ft from closing. Check a measurement.</p>
      )}

      <table className="results">
        <thead><tr><th></th><th>Calculated</th><th>Rep override</th><th>Used for pricing</th></tr></thead>
        <tbody>
          <tr>
            <td>Linear ft of wall</td>
            <td>{result.calcPerimeterLf}</td>
            <td><input inputMode="decimal" value={active.overridePerimeterLf ?? ''}
              onChange={e => update({ overridePerimeterLf: numOrNull(e.target.value) })} /></td>
            <td><strong>{result.perimeterLf}</strong></td>
          </tr>
          <tr>
            <td>Interior sq ft</td>
            <td>{result.calcAreaSf}</td>
            <td><input inputMode="decimal" value={active.overrideAreaSf ?? ''}
              onChange={e => update({ overrideAreaSf: numOrNull(e.target.value) })} /></td>
            <td><strong>{result.areaSf}</strong></td>
          </tr>
        </tbody>
      </table>
      {result.overridden && (
        <label className="block">Reason for override
          <input value={active.overrideReason ?? ''} onChange={e => update({ overrideReason: e.target.value })} />
        </label>
      )}
      {needsOverrideReview(result) && (
        <p className="warn">Override is {result.overridePct}% off the drawing. Your manager will see a flag.</p>
      )}

      <div className="totals">
        <div><span>Foundation wall</span><strong>{sum.perimeterLf} lf</strong></div>
        <div><span>Interior</span><strong>{sum.interiorSf} sq ft</strong></div>
        <div><span>Attic</span><strong>{sum.atticSf} sq ft</strong></div>
      </div>
    </div>
  );
}
