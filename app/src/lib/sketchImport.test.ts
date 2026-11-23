import { describe, expect, it } from 'vitest';
import { checkReading, extraToWalls, readingToWalls, type SketchReading } from './sketchImport';
import { areaSf, perimeterLf } from './footprint';

// The sample sketch Nathan sent: a 49 x 29 house, right side labeled 7 + 22, bottom labeled 32 + 17, two stoops.
const sample: SketchReading = {
  outline: [
    { length_ft: 49, direction: 'right' }, { length_ft: 7, direction: 'down' }, { length_ft: 22, direction: 'down' },
    { length_ft: 17, direction: 'left' }, { length_ft: 32, direction: 'left' }, { length_ft: 29, direction: 'up' },
  ],
  extras: [
    { label: 'RSS', kind: 'stoop', width_ft: 6, depth_ft: 6 },
    { label: 'RSS', kind: 'stoop', width_ft: 16, depth_ft: 6 },
  ],
  confidence: 'high', notes: '', stated_area_sf: 1421, stated_perimeter_lf: null,
};

describe('assessor sketch import', () => {
  it('builds the main outline from the reading', () => {
    const walls = readingToWalls(sample);
    expect(walls.map(w => w.dirDeg)).toEqual([0, 90, 90, 180, 180, 270]);
    expect(areaSf(walls)).toBe(1421);
    expect(perimeterLf(walls)).toBe(156);
  });
  it('passes the checks when the outline closes and matches the stated area', () => {
    expect(checkReading(sample).warnings).toEqual([]);
  });
  it('warns when the outline does not close or disagrees with the sketch', () => {
    const bad = { ...sample, outline: sample.outline.map((w, i) => (i === 0 ? { ...w, length_ft: 45 } : w)), stated_perimeter_lf: 180 };
    const w = checkReading(bad).warnings.join(' ');
    expect(w).toMatch(/does not close/);
    expect(w).toMatch(/180 ln ft/);
  });
  it('turns a stoop into its own rectangle', () => {
    const walls = extraToWalls(sample.extras[1]);
    expect(areaSf(walls)).toBe(96);
    expect(perimeterLf(walls)).toBe(44);
  });
});
