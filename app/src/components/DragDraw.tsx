// Drag-to-draw for the foundation footprint. The rep drags anywhere on the grid; the new wall starts at the end of
// the last wall, snaps to right angles (or 45° when turned on) and to whole feet. Tap a wall to type its exact length.
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { vertices, type Wall } from '../lib/footprint';

const GRID_FT = 5;
type Drag = { sx: number; sy: number; wall: Wall | null; onWall: number | null };

export function snapWall(dxFt: number, dyFt: number, allow45: boolean, stepFt = 1): Wall | null {
  const len = Math.hypot(dxFt, dyFt);
  const step = allow45 ? 45 : 90;
  const raw = (Math.atan2(dyFt, dxFt) * 180) / Math.PI;
  const dirDeg = ((Math.round(raw / step) * step) % 360 + 360) % 360;
  // project onto the snapped direction so the length matches what the finger shows
  const r = (dirDeg * Math.PI) / 180;
  const proj = dxFt * Math.cos(r) + dyFt * Math.sin(r);
  const lengthFt = Math.round(Math.max(proj, 0) / stepFt) * stepFt;
  return len < stepFt / 2 || lengthFt < stepFt ? null : { lengthFt, dirDeg };
}

/** Wall that closes the shape back to the starting corner, or null when already closed. */
export function closingWall(walls: Wall[]): Wall | null {
  const pts = vertices(walls); const last = pts[pts.length - 1];
  const gap = Math.hypot(last.x, last.y);
  if (walls.length < 2 || gap <= 0.5) return null;
  const dirDeg = Math.round((((Math.atan2(-last.y, -last.x) * 180) / Math.PI) % 360 + 360) % 360 * 10) / 10;
  return { lengthFt: Math.round(gap * 10) / 10, dirDeg };
}

export default function DragDraw({ walls, onChange }: { walls: Wall[]; onChange: (w: Wall[]) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pxPerFt, setPxPerFt] = useState(6);
  const [allow45, setAllow45] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [frozen, setFrozen] = useState<{ cx: number; cy: number } | null>(null); // keep the view still while dragging

  const pts = useMemo(() => vertices(walls), [walls]);
  const last = pts[pts.length - 1];
  const W = 340, H = 300;
  const center = useMemo(() => {
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 };
  }, [pts]);
  const { cx, cy } = frozen ?? center;
  const viewW = W / pxPerFt, viewH = H / pxPerFt;
  const vx = cx - viewW / 2, vy = cy - viewH / 2;

  const toFt = (e: RPointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: vx + ((e.clientX - r.left) / r.width) * viewW, y: vy + ((e.clientY - r.top) / r.height) * viewH };
  };
  const down = (e: RPointerEvent<SVGSVGElement>) => {
    // a tap on a wall selects it; a drag (even one starting on a wall) draws the next wall
    const wallEl = (e.target as Element).closest('.dd-wall');
    svgRef.current?.setPointerCapture?.(e.pointerId);
    const p = toFt(e); setFrozen({ cx, cy });
    setDrag({ sx: p.x, sy: p.y, wall: null, onWall: wallEl ? Number(wallEl.getAttribute('data-i')) : null });
  };
  const move = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const p = toFt(e);
    setDrag({ ...drag, wall: snapWall(p.x - drag.sx, p.y - drag.sy, allow45) });
  };
  const up = () => {
    if (drag?.wall) { onChange([...walls, drag.wall]); setSel(null); }
    else if (drag) setSel(drag.onWall);
    setDrag(null); setFrozen(null);
  };

  const preview = drag?.wall ? (() => {
    const r = (drag.wall.dirDeg * Math.PI) / 180;
    return { x: last.x + drag.wall.lengthFt * Math.cos(r), y: last.y + drag.wall.lengthFt * Math.sin(r) };
  })() : null;
  const close = closingWall(walls);
  const gridLines = [];
  for (let gx = Math.floor(vx / GRID_FT) * GRID_FT; gx <= vx + viewW; gx += GRID_FT) gridLines.push(<line key={`x${gx}`} x1={gx} y1={vy} x2={gx} y2={vy + viewH} className="dd-grid" />);
  for (let gy = Math.floor(vy / GRID_FT) * GRID_FT; gy <= vy + viewH; gy += GRID_FT) gridLines.push(<line key={`y${gy}`} x1={vx} y1={gy} x2={vx + viewW} y2={gy} className="dd-grid" />);
  const fs = 12 / pxPerFt, sw = 2.5 / pxPerFt;

  return (
    <div className="dragdraw">
      <svg ref={svgRef} viewBox={`${vx} ${vy} ${viewW} ${viewH}`} className="dd-canvas"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {gridLines}
        {walls.length > 2 && <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')} className="fp-fill" />}
        {walls.map((w, i) => {
          const a = pts[i], b = pts[i + 1];
          return (
            <g key={i} className="dd-wall" data-i={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14 / pxPerFt} />
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={sel === i ? 'fp-wall dd-sel' : 'fp-wall'} strokeWidth={sw} />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} dy={-fs / 2} fontSize={fs} textAnchor="middle" className="fp-label">{w.lengthFt}'</text>
            </g>
          );
        })}
        {preview && (<>
          <line x1={last.x} y1={last.y} x2={preview.x} y2={preview.y} className="dd-preview" strokeWidth={sw} />
          <text x={(last.x + preview.x) / 2} y={(last.y + preview.y) / 2} dy={-fs / 2} fontSize={fs * 1.3} textAnchor="middle" className="dd-preview-label">{drag!.wall!.lengthFt}'</text>
        </>)}
        <circle cx={0} cy={0} r={4 / pxPerFt} className="fp-start" />
        <circle cx={last.x} cy={last.y} r={6 / pxPerFt} className="dd-end" />
      </svg>
      <p className="muted small">Drag anywhere to draw the next wall from the blue dot. Walls snap to {allow45 ? '45°' : 'right angles'} and whole feet. Tap a wall to type its exact length. Grid squares are {GRID_FT} ft.</p>
      <div className="row">
        <button onClick={() => setPxPerFt(z => Math.min(z * 1.4, 30))}>Zoom in</button>
        <button onClick={() => setPxPerFt(z => Math.max(z / 1.4, 1.5))}>Zoom out</button>
        <label className="check"><input type="checkbox" checked={allow45} onChange={e => setAllow45(e.target.checked)} /> Allow 45°</label>
        <button onClick={() => { onChange(walls.slice(0, -1)); setSel(null); }} disabled={!walls.length}>Undo</button>
        {close && <button className="primary" onClick={() => onChange([...walls, close])}>Close shape ({close.lengthFt}')</button>}
      </div>
      {sel != null && walls[sel] && (
        <div className="row dd-edit">
          <label>Wall {sel + 1} length (ft)
            <input inputMode="decimal" autoFocus defaultValue={walls[sel].lengthFt} key={sel}
              onBlur={e => { const n = parseFloat(e.target.value); if (n > 0) onChange(walls.map((w, i) => (i === sel ? { ...w, lengthFt: n } : w))); }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          </label>
          <button onClick={() => { onChange(walls.filter((_, i) => i !== sel)); setSel(null); }}>Delete wall</button>
          <button onClick={() => setSel(null)}>Done</button>
        </div>
      )}
    </div>
  );
}
