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
