// Groups the rep's selected work into customer-facing packages, so the proposal shows a scope
// story and one price instead of a price per item (customers can't cherry-pick).
// Packaging is automatic (rules below) and works offline; the rep can rename a package or move a
// line to another package.
import type { BookItem } from './priceBook';
import { lineTotal } from './pricing';

export type PackageKey = 'structural' | 'water' | 'moisture' | 'exterior' | 'termite' | 'attic' | 'ongoing';

export const PACKAGE_DEFS: Record<PackageKey, { name: string; pitch: string; order: number }> = {
  structural: { order: 1, name: 'Structural Repair Package', pitch: 'Restores the strength of the framing that supports your floors.' },
  water: { order: 2, name: 'Crawl Space Water Management Package', pitch: 'Captures water and moves it away from your foundation.' },
  moisture: { order: 3, name: 'Crawl Space Moisture Control Package', pitch: 'Keeps humidity down to protect wood, stop odors, and discourage pests.' },
  exterior: { order: 4, name: 'Exterior Protection Package', pitch: 'Seals the outside of your home against water and pest entry.' },
  termite: { order: 5, name: 'Termite & Wood Protection Package', pitch: 'Treats and protects your home against termites and wood-destroying organisms.' },
  attic: { order: 6, name: 'Attic Restoration Package', pitch: 'A clean, sealed, properly insulated attic.' },
  ongoing: { order: 7, name: 'Ongoing Protection Plan', pitch: 'Year-round service that keeps your home protected after the work is done.' },
};

/** Which package an item belongs in by default. */
export function packageFor(item: Pick<BookItem, 'section' | 'name'>): PackageKey {
  const n = item.name.toLowerCase();
  if (item.section === 'recurring') return 'ongoing';
  if (item.section === 'attic') return 'attic';
  if (item.section === 'foundation') return 'structural';
  if (item.section === 'pest') return 'termite';
  if (/french drain|sump pump/.test(n)) return 'water';
  if (/drip edge|siding shield|screen crawl vents/.test(n)) return 'exterior';
  return 'moisture';
}

export type Packaging = {
  names: Partial<Record<PackageKey, string>>;   // rep renames
  moves: Record<string, PackageKey>;             // line key -> package, when the rep moves a line
  combineWater: boolean;                         // fold water management into moisture control
  showPackagePrices: boolean;                    // default: one total only
};
export const defaultPackaging = (): Packaging => ({ names: {}, moves: {}, combineWater: true, showPackagePrices: false });

export type PkgLine = { key: string; item: BookItem; qty: number };
export type Package = {
  key: PackageKey; name: string; pitch: string;
  lines: PkgLine[]; scope: string[]; price: number; warranties: string[];
};

const fmtQty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
const UNIT: Record<string, string> = { sf: 'sq ft', lf: 'linear ft', hour: 'hours' };

/** One scope bullet per line, written for the customer (no prices). */
export function scopeText(l: PkgLine): string {
  const { item, qty } = l;
  let s = item.name;
  if (item.section !== 'recurring') {
    if (item.unit === 'sf' || item.unit === 'lf' || item.unit === 'hour') s += ` (${fmtQty(qty)} ${UNIT[item.unit]})`;
    else if (item.unit === 'each' && qty !== 1) s += ` (${fmtQty(qty)})`;
  }
  if (item.description) s += `: ${item.description}`;
  return s;
}

export function buildPackages(lines: PkgLine[], p: Packaging): Package[] {
  const groups = new Map<PackageKey, PkgLine[]>();
  for (const l of lines) {
    let k = p.moves[l.key] ?? packageFor(l.item);
    if (k === 'water' && p.combineWater && !p.moves[l.key]) k = 'moisture';
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => PACKAGE_DEFS[a].order - PACKAGE_DEFS[b].order)
    .map(([key, ls]) => {
      const hasWater = ls.some(l => packageFor(l.item) === 'water');
      const def = PACKAGE_DEFS[key];
      const autoName = key === 'moisture' && hasWater ? 'Crawl Space Waterproofing & Moisture Control Package' : def.name;
      const warranties = key === 'ongoing' ? [] : ['1-year workmanship warranty'];
      if (ls.some(l => /^(dehumidifier|full encapsulation)/i.test(l.item.name))) warranties.push('Aprilaire 5-year dehumidifier warranty');
      return {
        key, name: p.names[key]?.trim() || autoName, pitch: def.pitch, lines: ls,
        scope: ls.map(scopeText),
        price: Math.round(ls.reduce((s, l) => s + lineTotal({ item: l.item, qty: l.qty }), 0) * 100) / 100,
        warranties,
      };
    });
}
