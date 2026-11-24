// Footprint math for the drawing tool.
// A section is drawn wall by wall: each wall has a length (ft) and a direction.
// Direction is in degrees on screen: 0 = right, 90 = down, 180 = left, 270 = up.

export type Wall = { lengthFt: number; dirDeg: number };
export type Point = { x: number; y: number };

export type AreaType = 'crawlspace' | 'basement' | 'slab' | 'attic' | 'porch' | 'other';

export type Section = {
  id: string;
  label?: string;
  areaType: AreaType;
  includeInTotals: boolean;
  walls: Wall[];
  overridePerimeterLf?: number | null;
  overrideAreaSf?: number | null;
  overrideReason?: string | null;
  /** Counts toward the exterior perimeter (termite treatment, outside drains). Default: included non-attic sections. */
  exterior?: boolean;
  /** Feet of this section's wall that touch the house (an attached garage or stoop). Not part of the outside line. */
  sharedWallLf?: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Corner points, starting at (0,0). The last point is where the last wall ends. */
export function vertices(walls: Wall[]): Point[] {
  const pts: Point[] = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  for (const w of walls) {
    const r = (w.dirDeg * Math.PI) / 180;
    x += w.lengthFt * Math.cos(r);
    y += w.lengthFt * Math.sin(r);
    // Clean floating noise so 90-degree walls land on whole numbers.
    pts.push({ x: Math.abs(x) < 1e-9 ? 0 : x, y: Math.abs(y) < 1e-9 ? 0 : y });
  }
  return pts;
}

/** Sum of wall lengths = linear feet of foundation wall. */
export function perimeterLf(walls: Wall[]): number {
  return round2(walls.reduce((s, w) => s + Math.max(0, w.lengthFt), 0));
}

/** Distance (ft) between where the last wall ends and the starting corner. 0 = closed. */
export function closureGapFt(walls: Wall[]): number {
  const pts = vertices(walls);
  const end = pts[pts.length - 1];
  return round2(Math.hypot(end.x, end.y));
}

/** Enclosed area (sq ft) by the shoelace formula; an open shape is closed straight back to the start. */
export function areaSf(walls: Wall[]): number {
  const pts = vertices(walls);
  if (pts.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return round2(Math.abs(twice) / 2);
}

/** Snap a direction to the nearest 90 degrees (the default while drawing). */
export function snap90(dirDeg: number): number {
  return (((Math.round(dirDeg / 90) * 90) % 360) + 360) % 360;
}

/** Turn helper for the "walk the walls" input: next direction after turning left or right. */
export function turn(dirDeg: number, side: 'left' | 'right', degrees = 90): number {
  const d = side === 'right' ? dirDeg + degrees : dirDeg - degrees;
  return ((d % 360) + 360) % 360;
}

export type SectionResult = {
  calcPerimeterLf: number;
  calcAreaSf: number;
  closureGapFt: number;
  isClosed: boolean;
  perimeterLf: number; // what pricing uses: the override when set, else calculated
  areaSf: number;
  overridden: boolean;
  overridePct: number | null; // largest % difference between override and calculated
};

/** Gap under this many feet counts as closed (tape-measure rounding). */
export const CLOSE_TOLERANCE_FT = 0.5;

export function computeSection(s: Section): SectionResult {
  const calcPerimeterLf = perimeterLf(s.walls);
  const calcAreaSf = areaSf(s.walls);
  const gap = closureGapFt(s.walls);
  const pOver = s.overridePerimeterLf ?? null;
  const aOver = s.overrideAreaSf ?? null;
  const pct = (over: number | null, calc: number) =>
    over == null || calc === 0 ? null : Math.abs(over - calc) / calc * 100;
  const pcts = [pct(pOver, calcPerimeterLf), pct(aOver, calcAreaSf)].filter((v): v is number => v != null);
  return {
    calcPerimeterLf,
    calcAreaSf,
    closureGapFt: gap,
    isClosed: gap <= CLOSE_TOLERANCE_FT,
    perimeterLf: pOver ?? calcPerimeterLf,
    areaSf: aOver ?? calcAreaSf,
    overridden: pOver != null || aOver != null,
    overridePct: pcts.length ? round2(Math.max(...pcts)) : null,
  };
}

export type Totals = {
  perimeterLf: number; // foundation / crawl space wall LF (included non-attic sections)
  interiorSf: number;  // crawl/basement/slab/other interior sq ft
  atticSf: number;
  exteriorLf: number;  // outside line of the building, incl. attached garage/porch/stoop the rep counted
};

/** Whether a section counts toward the exterior perimeter. */
export function countsExterior(s: Section): boolean {
  return s.exterior ?? (s.includeInTotals && s.areaType !== 'attic');
}

/** A section's share of the exterior perimeter: its walls, minus the stretch it shares with the house (on both sides). */
export function exteriorLf(s: Section): number {
  if (!countsExterior(s) || s.areaType === 'attic') return 0;
  const p = computeSection(s).perimeterLf;
  return round2(Math.max(0, p - 2 * Math.max(0, s.sharedWallLf ?? 0)));
}

/** Totals that feed pricing quantities (qty_source perimeter_lf / interior_sf / attic_sf / exterior_lf). */
export function totals(sections: Section[]): Totals {
  let perimeter = 0;
  let interior = 0;
  let attic = 0;
  let exterior = 0;
  for (const s of sections) {
    exterior += exteriorLf(s);
    if (!s.includeInTotals) continue;
    const r = computeSection(s);
    if (s.areaType === 'attic') {
      attic += r.areaSf;
    } else {
      perimeter += r.perimeterLf;
      interior += r.areaSf;
    }
  }
  return { perimeterLf: round2(perimeter), interiorSf: round2(interior), atticSf: round2(attic), exteriorLf: round2(exterior) };
}

/** Flag for the manager when a rep's override is far from the drawing. */
export const OVERRIDE_FLAG_PCT = 15;
export function needsOverrideReview(r: SectionResult): boolean {
  return r.overridePct != null && r.overridePct > OVERRIDE_FLAG_PCT;
}
