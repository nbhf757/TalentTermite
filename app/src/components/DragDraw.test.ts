import { describe, expect, it } from 'vitest';
import { closingWall, snapWall } from './DragDraw';

describe('drag-to-draw snapping', () => {
  it('snaps a slightly crooked drag to a right angle and whole feet', () => {
    expect(snapWall(30.4, 2.1, false)).toEqual({ lengthFt: 30, dirDeg: 0 });
    expect(snapWall(-1.5, 19.6, false)).toEqual({ lengthFt: 20, dirDeg: 90 });
    expect(snapWall(-12.2, -0.8, false)).toEqual({ lengthFt: 12, dirDeg: 180 });
  });
  it('allows 45 degrees when turned on', () => {
    expect(snapWall(10, 10, true)?.dirDeg).toBe(45);
    expect(snapWall(10, 10, false)?.dirDeg === 0 || snapWall(10, 10, false)?.dirDeg === 90).toBe(true);
  });
  it('ignores tiny drags', () => { expect(snapWall(0.3, 0.1, false)).toBeNull(); });
  it('closes a rectangle missing its last wall', () => {
    expect(closingWall([{ lengthFt: 40, dirDeg: 0 }, { lengthFt: 30, dirDeg: 90 }, { lengthFt: 40, dirDeg: 180 }]))
      .toEqual({ lengthFt: 30, dirDeg: 270 });
    expect(closingWall([{ lengthFt: 40, dirDeg: 0 }, { lengthFt: 40, dirDeg: 180 }])).toBeNull();
  });
});
