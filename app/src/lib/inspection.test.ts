import { describe, expect, it } from 'vitest';
import { ALL_POINTS, isAnswered, progress, SECTIONS } from './inspection';

describe('27-point inspection', () => {
  it('has the 27 form points plus insulation type, in 4 sections', () => {
    expect(ALL_POINTS).toHaveLength(28);
    expect(SECTIONS.map(s => s.points.length)).toEqual([12, 5, 4, 6]);
  });

  it('validates answers by type', () => {
    const moisture = ALL_POINTS.find(p => p.key === 'crawl_wood_moisture')!;
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
    expect(p.missing).toHaveLength(26);
  });
});
