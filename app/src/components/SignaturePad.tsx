import { useEffect, useRef } from 'react';

/** Finger/stylus signature. Calls onChange with a PNG data URL, or null when cleared. */
export default function SignaturePad({ value, onChange, label }: { value: string | null; onChange: (v: string | null) => void; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = ref.current!; const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d')!; ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1f2328';
    if (value) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, c.offsetWidth, c.offsetHeight); img.src = value; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const ctx = () => ref.current!.getContext('2d')!;

  return (
    <div className="sig">
      <div className="sig-label"><span>{label}</span>
        <button className="link" onClick={() => { const c = ref.current!; ctx().clearRect(0, 0, c.width, c.height); onChange(null); }}>Clear</button>
      </div>
      <canvas ref={ref} className="sig-canvas"
        onPointerDown={e => { drawing.current = true; ref.current!.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx().beginPath(); ctx().moveTo(x, y); }}
        onPointerMove={e => { if (!drawing.current) return; const [x, y] = pos(e); ctx().lineTo(x, y); ctx().stroke(); }}
        onPointerUp={() => { drawing.current = false; onChange(ref.current!.toDataURL('image/png')); }} />
    </div>
  );
}
