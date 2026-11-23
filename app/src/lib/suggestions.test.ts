import { describe, expect, it } from 'vitest';
import fallback from '../data/fallback_prices.json';
import { suggest } from './suggestions';

describe('suggestions', () => {
  it('fires on matching answers only', () => {
    const s = suggest({ crawl_moisture_fr: { value: '14' }, crawl_moisture_rl: { value: '24' }, crawl_musty: { value: 'No' }, attic_insulation_depth: { value: '6' } });
    expect(s.map(x => x.point)).toEqual(['crawl_moisture_max', 'attic_insulation_depth']);
    expect(suggest({ crawl_moisture_fr: { value: '15' }, crawl_moisture_center: { value: '19' } })).toHaveLength(0);
    expect(suggest({ crawl_moisture_fr: { value: 'N/A' } })).toHaveLength(0);
    expect(suggest({})).toHaveLength(0);
  });

  it('every suggested item exists in the price book', () => {
    const names = new Set(fallback.items.map(i => i.name));
    const all = suggest(Object.fromEntries([
      'crawl_standing_water','crawl_musty','crawl_damaged_wood','crawl_fungus','crawl_termites','attic_termites',
      'crawl_rodents','attic_rodents','int_rodents','int_droppings','int_pests','ext_nearby_water','ext_trees_over_roof',
    ].map(k => [k, { value: 'Yes' }]).concat([
      ['crawl_moisture_center', { value: '30' }], ['crawl_vapor_barrier', { value: 'Needs Attention' }],
      ['crawl_encapsulated', { value: 'No' }], ['crawl_ventilation', { value: 'No' }], ['attic_insulation_depth', { value: '4' }],
      ['ext_prior_termite_treatment', { value: 'Yes - Bait' }], ['ext_gutters_clear', { value: 'No' }],
    ])));
    expect(all.length).toBe(20);
    for (const s of all) for (const n of s.itemNames) expect(names.has(n), n).toBe(true);
  });
});
