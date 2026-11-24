// "Read an assessor sketch": the rep picks a photo or screenshot of the City Assessor sketch, the server's AI
// reads the outline, and the rep checks the preview before it replaces the walls of the current section.
import { useRef, useState } from 'react';
import { vertices, type Wall } from '../lib/footprint';
import { checkReading, readSketch, type SketchExtra, type SketchReading } from '../lib/sketchImport';

function Preview({ walls }: { walls: Wall[] }) {
  const pts = vertices(walls);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const w = Math.max(...xs) - minX || 1, h = Math.max(...ys) - minY || 1;
  const pad = Math.max(w, h) * 0.12, fs = Math.max(w, h) / 18;
  return (
    <svg viewBox={`${minX - pad} ${minY - pad} ${w + 2 * pad} ${h + 2 * pad}`} className="footprint" style={{ maxHeight: 220 }}>
      <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')} className="fp-fill" />
      {walls.map((wl, i) => (
        <g key={i}>
          <line x1={pts[i].x} y1={pts[i].y} x2={pts[i + 1].x} y2={pts[i + 1].y} className="fp-wall" strokeWidth={Math.max(w, h) / 150} />
          <text x={(pts[i].x + pts[i + 1].x) / 2} y={(pts[i].y + pts[i + 1].y) / 2} dy={-fs / 3} fontSize={fs} textAnchor="middle" className="fp-label">{wl.lengthFt}'</text>
        </g>
      ))}
    </svg>
  );
}

export default function SketchImport({ onUse }: { onUse: (walls: Wall[], extras: SketchExtra[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reading, setReading] = useState<SketchReading | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr(''); setReading(null);
    try { const r = await readSketch(f); setReading(r); setKeep(r.extras.map(() => false)); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const check = reading ? checkReading(reading) : null;

  return (
    <div className="sketch-import">
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => pick(e.target.files?.[0])} />
      {!reading && (
        <button onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Reading the sketch… (about 20–40 seconds)' : '📷 Read an assessor sketch'}
        </button>
      )}
      {err && <p className="warn small">{err}</p>}
      {reading && check && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>From the sketch</h3>
          {check.walls.length >= 2 ? <Preview walls={check.walls} /> : <p className="muted">No outline found.</p>}
          <p><strong>{check.areaSf} sq ft</strong> · <strong>{check.perimeterLf} ln ft</strong> · {check.walls.length} walls</p>
          {check.warnings.map((w, i) => <p key={i} className="warn small">⚠ {w}</p>)}
          {reading.notes && <p className="muted small">{reading.notes}</p>}
          {reading.extras.length > 0 && (<>
            <p className="small" style={{ marginBottom: 4 }}>Left out of the house outline:</p>
            {reading.extras.map((x, i) => (
              <label key={i} className="check small" style={{ display: 'block' }}>
                <input type="checkbox" checked={!!keep[i]} onChange={e => setKeep(k => k.map((v, j) => (j === i ? e.target.checked : v)))} />
                {' '}{x.kind} {x.label && x.label !== x.kind ? `(${x.label})` : ''} {x.width_ft}' × {x.depth_ft}', add it (counts toward the exterior perimeter only, not the crawl space)
              </label>
            ))}
          </>)}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary" disabled={check.walls.length < 2}
              onClick={() => { onUse(check.walls, reading.extras.filter((_, i) => keep[i])); setReading(null); }}>Use this drawing</button>
            <button onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? 'Reading…' : 'Try another picture'}</button>
            <button onClick={() => setReading(null)}>Cancel</button>
          </div>
          <p className="muted small">You can fix any wall after loading it. Always compare with the sketch.</p>
        </div>
      )}
    </div>
  );
}
