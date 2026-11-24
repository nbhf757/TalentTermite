import { describe, expect, it } from 'vitest';
import { ALL_POINTS, commentsMissing, isAnswered, maxMoisture, negativePoints, notesMissing, progress, SECTIONS } from './inspection';

describe('27-point inspection', () => {
  it('has the form points with five moisture readings, in 4 sections', () => {
    expect(ALL_POINTS).toHaveLength(32);
    expect(SECTIONS.map(s => s.points.length)).toEqual([16, 6, 4, 6]);
  });

  it('validates answers by type', () => {
    const moisture = ALL_POINTS.find(p => p.key === 'crawl_moisture_center')!;
    expect(isAnswered(moisture, { value: '22' })).toBe(true);
    expect(isAnswered(moisture, { value: 'N/A' })).toBe(true);
    expect(isAnswered(moisture, { value: 'wet' })).toBe(false);
    const vent = ALL_POINTS.find(p => p.key === 'attic_ventilation')!;
    expect(isAnswered(vent, { value: 'N/A' })).toBe(false); // attic points are yes/no only
    expect(isAnswered(vent, { value: 'No' })).toBe(true);
  });

  it('tracks progress', () => {
    const p = progress({ crawl_musty: { value: 'Yes' } });
    expect(p.done).toBe(1);
    expect(p.complete).toBe(false);
    expect(p.missing).toHaveLength(31);
  });

  it('finds answers that need attention and requires a note on each', () => {
    const a = { crawl_moisture_fl: { value: '22' }, crawl_moisture_rr: { value: '12' }, crawl_musty: { value: 'No' },
      attic_insulation_depth: { value: '8' }, ext_gutters_clear: { value: 'No' }, crawl_encapsulated: { value: 'No' } };
    expect(maxMoisture(a)).toBe(22);
    expect(negativePoints(a)).toEqual(['Wood Moisture: Front Left', 'Depth of Insulation', 'Gutters Free of Debris']);
    expect(commentsMissing(a)).toBe(true);
    expect(notesMissing({ ...a, crawl_moisture_fl: { value: '22', note: 'Wet sill, front left' } })).toEqual(['Depth of Insulation', 'Gutters Free of Debris']);
    const all = { ...a, crawl_moisture_fl: { value: '22', note: 'x' }, attic_insulation_depth: { value: '8', note: 'y' }, ext_gutters_clear: { value: 'No', note: '  z ' } };
    expect(commentsMissing(all)).toBe(false);
    expect(commentsMissing({ crawl_musty: { value: 'No' } })).toBe(false);
  });
});
