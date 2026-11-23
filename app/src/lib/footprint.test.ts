import { describe, expect, it } from 'vitest';
import {
  areaSf, closureGapFt, computeSection, needsOverrideReview, perimeterLf,
  snap90, totals, turn, type Section, type Wall,
} from './footprint';

const rect = (w: number, h: number): Wall[] => [
  { lengthFt: w, dirDeg: 0 },
  { lengthFt: h, dirDeg: 90 },
  { lengthFt: w, dirDeg: 180 },
  { lengthFt: h, dirDeg: 270 },
];

// 40 x 30 house with a 12 x 10 bump-out on the right side
const lShape: Wall[] = [
  { lengthFt: 40, dirDeg: 0 },
  { lengthFt: 10, dirDeg: 90 },
  { lengthFt: 12, dirDeg: 0 },
  { lengthFt: 10, dirDeg: 90 },
  { lengthFt: 12, dirDeg: 180 },
  { lengthFt: 10, dirDeg: 90 },
  { lengthFt: 40, dirDeg: 180 },
  { lengthFt: 30, dirDeg: 270 },
];

describe('footprint math', () => {
  it('rectangle: perimeter, area, closed', () => {
    const w = rect(40, 30);
    expect(perimeterLf(w)).toBe(140);
    expect(areaSf(w)).toBe(1200);
    expect(closureGapFt(w)).toBe(0);
  });

  it('bump-out adds its area and its two side walls', () => {
    expect(areaSf(lShape)).toBe(1200 + 120);
    expect(perimeterLf(lShape)).toBe(140 + 24);
    expect(closureGapFt(lShape)).toBe(0);
  });

  it('drawing direction (clockwise or counter) does not change area', () => {
    const ccw: Wall[] = [
      { lengthFt: 30, dirDeg: 90 },
      { lengthFt: 40, dirDeg: 0 },
      { lengthFt: 30, dirDeg: 270 },
      { lengthFt: 40, dirDeg: 180 },
    ];
    expect(areaSf(ccw)).toBe(1200);
  });

  it('flags a mis-measured wall as a closure gap', () => {
    const off = rect(40, 30);
    off[2] = { lengthFt: 39.5, dirDeg: 180 };
    const r = computeSection({ id: 'a', areaType: 'crawlspace', includeInTotals: true, walls: off });
    expect(r.closureGapFt).toBe(0.5);
    expect(r.isClosed).toBe(true); // within tolerance
    off[2] = { lengthFt: 38, dirDeg: 180 };
    expect(computeSection({ id: 'a', areaType: 'crawlspace', includeInTotals: true, walls: off }).isClosed).toBe(false);
  });

  it('angled walls (45 degrees) compute correctly', () => {
    // Right triangle with legs 10 and 10
    const tri: Wall[] = [
      { lengthFt: 10, dirDeg: 0 },
      { lengthFt: 10, dirDeg: 90 },
      { lengthFt: Math.SQRT2 * 10, dirDeg: 225 },
    ];
    expect(areaSf(tri)).toBe(50);
    expect(closureGapFt(tri)).toBe(0);
  });

  it('overrides win for pricing, and both numbers are kept', () => {
    const s: Section = {
      id: 'a', areaType: 'crawlspace', includeInTotals: true, walls: rect(40, 30),
      overrideAreaSf: 1100, overrideReason: 'HVAC pad excluded',
    };
    const r = computeSection(s);
    expect(r.calcAreaSf).toBe(1200);
    expect(r.areaSf).toBe(1100);
    expect(r.perimeterLf).toBe(140);
    expect(r.overridden).toBe(true);
    expect(r.overridePct).toBe(8.33);
    expect(needsOverrideReview(r)).toBe(false);
    expect(needsOverrideReview(computeSection({ ...s, overrideAreaSf: 900 }))).toBe(true);
  });

  it('totals split attic from foundation and skip excluded sections', () => {
    const t = totals([
      { id: 'main', areaType: 'crawlspace', includeInTotals: true, walls: rect(40, 30) },
      { id: 'porch', areaType: 'porch', includeInTotals: false, walls: rect(10, 8) },
      { id: 'attic', areaType: 'attic', includeInTotals: true, walls: rect(40, 30), overrideAreaSf: 1405 },
    ]);
    expect(t).toEqual({ perimeterLf: 140, interiorSf: 1200, atticSf: 1405 });
  });

  it('turn and snap helpers', () => {
    expect(turn(0, 'right')).toBe(90);
    expect(turn(0, 'left')).toBe(270);
    expect(snap90(84)).toBe(90);
    expect(snap90(-10)).toBe(0);
    expect(snap90(350)).toBe(0);
  });
});
