// Items where the rep picks how the work is done. The choice changes the customer-facing scope text.
export type Variant = { key: string; label: string; description?: string }; // no description = use the item's own
export const VARIANTS: Record<string, Variant[]> = {
  // Nathan 2026-11-23: usually replace; reinforce is the rep's call.
  Beam: [
    { key: 'replace', label: 'Replace' },
    { key: 'reinforce', label: 'Reinforce', description: 'Reinforce the damaged beam (the main support under the floor joists) with new treated lumber to restore support to the floor system.' },
  ],
};
export const variantDescription = (itemName: string, variant?: string) =>
  VARIANTS[itemName]?.find(v => v.key === variant)?.description;

export const TOP_DOWN_SUBFLOOR = 'Subfloor Remove & Replace (top down)';
export const DUMPSTER = 'Dumpster Fee (large demo)';

// Nathan 2026-11-23: vapor barriers are 10 mil (taped or staked) or 45 mil; one per job.
export const isVaporBarrier = (name: string) => /^Vapor Barrier \(/.test(name);

// Encapsulation uses 45 mil taped and includes the vapor barrier, vent sealing, fungus treatment, and a
// dehumidifier with electrician. Those can't be sold separately with it; the proposal lists them as included.
export const isEncapsulation = (name: string) => name.startsWith('Full Encapsulation');
export const includedWithEncapsulation = (name: string) =>
  isVaporBarrier(name) || name === 'Vapor Barrier Install Only' || name === 'Vent Covers' ||
  name === 'Fungus/Beetle Treatment' || name.startsWith('Dehumidifier') || name === 'Screen Crawl Vents';
export const encapsulationIncludes = (vents?: number) =>
  `Included with encapsulation: 45 mil vapor barrier with taped seams, sealing of ${vents ? `all ${vents} ` : 'the '}crawl space vents, ` +
  'fungus treatment, and a dehumidifier installed with a licensed electrician.';
