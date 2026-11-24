// Turns the AI reading of a City Assessor sketch (Edge Function read-sketch) into drawing-tool walls.
// The rep reviews the preview and can edit any wall afterward; nothing is saved until they accept it.
import { computeSection, type Section, type Wall } from './footprint';
import { supabase } from './supabase';

export type SketchDirection = 'right' | 'down' | 'left' | 'up' | 'up-right' | 'down-right' | 'down-left' | 'up-left';
export type SketchExtra = { label: string; kind: 'stoop' | 'porch' | 'deck' | 'garage' | 'addition' | 'other'; width_ft: number; depth_ft: number };
export type SketchReading = {
  outline: { length_ft: number; direction: SketchDirection }[];
  extras: SketchExtra[];
  confidence: 'high' | 'medium' | 'low';
  notes: string;
  stated_area_sf: number | null;
  stated_perimeter_lf: number | null;
};

const DEG: Record<SketchDirection, number> = {
  right: 0, 'down-right': 45, down: 90, 'down-left': 135, left: 180, 'up-left': 225, up: 270, 'up-right': 315,
};

export function readingToWalls(r: SketchReading): Wall[] {
  return r.outline
    .filter(w => w.length_ft > 0 && w.direction in DEG)
    .map(w => ({ lengthFt: Math.round(w.length_ft * 10) / 10, dirDeg: DEG[w.direction] }));
}

/** A stoop/porch as its own closed rectangle (width across, depth out), so it can be added as a separate section. */
export function extraToWalls(x: SketchExtra): Wall[] {
  const w = Math.max(0, x.width_ft), d = Math.max(0, x.depth_ft);
  if (!w || !d) return [];
  return [{ lengthFt: w, dirDeg: 0 }, { lengthFt: d, dirDeg: 90 }, { lengthFt: w, dirDeg: 180 }, { lengthFt: d, dirDeg: 270 }];
}

/** Checks to show the rep: does the outline close, and does it match what the sketch says? */
export function checkReading(r: SketchReading) {
  const walls = readingToWalls(r);
  const res = computeSection({ id: 'x', areaType: 'crawlspace', includeInTotals: true, walls } as Section);
  const warnings: string[] = [];
  if (walls.length < 3) warnings.push('Fewer than 3 walls were found.');
  if (res.closureGapFt > 0.5) warnings.push(`The outline does not close (off by ${res.closureGapFt} ft). Check the wall lengths.`);
  if (r.stated_area_sf && Math.abs(res.calcAreaSf - r.stated_area_sf) > Math.max(10, r.stated_area_sf * 0.02))
    warnings.push(`Sketch says ${r.stated_area_sf} sq ft; the drawing comes to ${res.calcAreaSf}.`);
  if (r.stated_perimeter_lf && Math.abs(res.calcPerimeterLf - r.stated_perimeter_lf) > Math.max(2, r.stated_perimeter_lf * 0.02))
    warnings.push(`Sketch says ${r.stated_perimeter_lf} ln ft; the drawing comes to ${res.calcPerimeterLf}.`);
  if (r.confidence === 'low') warnings.push('The AI was not confident reading this one. Check every wall.');
  return { walls, areaSf: res.calcAreaSf, perimeterLf: res.calcPerimeterLf, closureGapFt: res.closureGapFt, warnings };
}

/** Shrinks a photo to a size the server accepts (long side 1600 px, JPEG) and returns base64 without the data: prefix. */
export async function photoToBase64(file: File, maxSide = 1600): Promise<{ data: string; mediaType: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('That file is not a picture the app can read.')); i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); // transparent PNGs -> white, not black
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/jpeg', 0.88).split(',')[1], mediaType: 'image/jpeg' };
  } finally { URL.revokeObjectURL(url); }
}

export async function readSketch(file: File): Promise<SketchReading> {
  if (!supabase) throw new Error('The app is not connected to the server.');
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('Reading a sketch needs a connection. Draw it by hand for now.');
  const { data: image, mediaType } = await photoToBase64(file);
  const { data, error } = await supabase.functions.invoke('read-sketch', { body: { image, media_type: mediaType } });
  if (error) {
    let msg = error.message;
    try { const body = await (error as { context?: Response }).context?.json(); if (body?.error) msg = body.error; } catch { /* keep message */ }
    throw new Error(msg);
  }
  return data as SketchReading;
}
