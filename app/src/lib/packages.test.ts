import { describe, expect, it } from 'vitest';
import fallback from '../data/fallback_prices.json';
import type { BookItem } from './priceBook';
import { buildPackages, defaultPackaging, packageFor, scopeText } from './packages';

const items = fallback.items as BookItem[];
const get = (name: string) => items.find(i => i.name === name)!;
const line = (name: string, qty: number, key = name) => ({ key, item: get(name), qty });

describe('packages', () => {
  it('every price book item has a home', () => {
    for (const i of items) expect(packageFor(i)).toBeTruthy();
    expect(packageFor(get('French Drain (inside)'))).toBe('water');
    expect(packageFor(get('Drip Edge (one story)'))).toBe('exterior');
    expect(packageFor(get('Vapor Barrier (20 mil)'))).toBe('moisture');
    expect(packageFor(get('Talent Plus'))).toBe('ongoing');
  });

  it('bundles lines and prices each package once', () => {
    const pk = buildPackages([
      line('Vapor Barrier (20 mil)', 1000), line('Dehumidifier (with electrician)', 1),
      line('French Drain (inside)', 100), line('Floor Joist', 2), line('Termidor HE Termite Treatment', 40),
    ], defaultPackaging());
    expect(pk.map(p => p.key)).toEqual(['structural', 'moisture', 'termite']);
    const m = pk[1];
    expect(m.name).toBe('Crawl Space Waterproofing & Moisture Control Package');
    expect(m.price).toBe(3550 + 3800 + 3500);
    expect(m.warranties).toContain('Aprilaire 5-year dehumidifier warranty');
    expect(pk[2].price).toBe(425); // minimum applies inside the package
  });

  it('rep can split water out, rename, and move lines', () => {
    const p = { ...defaultPackaging(), combineWater: false, names: { structural: 'Floor Repair' }, moves: { j: 'moisture' as const } };
    const pk = buildPackages([line('French Drain (inside)', 50), line('Floor Joist', 1, 'j')], p);
    expect(pk.map(x => x.key)).toEqual(['water', 'moisture']);
    expect(pk.find(x => x.key === 'moisture')!.lines[0].item.name).toBe('Floor Joist');
  });

  it('scope text has quantities, never prices', () => {
    expect(scopeText(line('Vapor Barrier (20 mil)', 1452))).toBe('Vapor Barrier (20 mil) (1,452 sq ft)');
    expect(scopeText(line('Floor Joist', 3))).toBe('Floor Joist (3)');
    expect(scopeText(line('Talent Plus', 1))).toBe('Talent Plus: General pest + rodents');
  });
});
