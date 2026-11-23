// Turns inspection answers into suggested work. DRAFT rules from config/suggestion_rules_DRAFT.csv,
// pending Nathan's review (the 20% wood-moisture threshold especially). Suggestions never add work on
// their own; the rep taps to add.
import { ATTIC_R49_INCHES, maxMoisture, WOOD_MOISTURE_PCT, type Answers } from './inspection';

export type Suggestion = { point: string; reason: string; itemNames: string[]; note?: string };

export { ATTIC_R49_INCHES, WOOD_MOISTURE_PCT };

type Rule = { point: string; when: (v: string) => boolean; reason: string; itemNames: string[]; note?: string };

const yes = (v: string) => v === 'Yes';
const RULES: Rule[] = [
  { point: 'crawl_standing_water', when: yes, reason: 'Standing water in crawlspace', itemNames: ['French Drain (inside)', 'Sump Pump (with electrician)'] },
  { point: 'crawl_moisture_max', when: v => v !== '' && Number(v) >= WOOD_MOISTURE_PCT, reason: `Wood moisture at or above ${WOOD_MOISTURE_PCT}%`, itemNames: ['Dehumidifier (with electrician)'] },
  { point: 'crawl_musty', when: yes, reason: 'Musty smell', itemNames: ['Dehumidifier (with electrician)'] },
  { point: 'crawl_vapor_barrier', when: v => v === 'Needs Attention', reason: 'Vapor barrier needs attention', itemNames: ['Vapor Barrier (10 mil), taped seams'] },
  { point: 'crawl_encapsulated', when: v => v === 'No', reason: 'Not encapsulated', itemNames: ['Full Encapsulation (no foam board insulation)'], note: 'Offer as an option' },
  { point: 'crawl_ventilation', when: v => v === 'No', reason: 'Poor crawlspace ventilation', itemNames: ['Vent Covers'] },
  { point: 'crawl_damaged_wood', when: yes, reason: 'Damaged wood members', itemNames: ['Floor Joist', 'Sill Plate (under 8 ft)', 'Beam'], note: 'Rep sets counts' },
  { point: 'crawl_fungus', when: yes, reason: 'Fungus present', itemNames: ['Fungus/Beetle Treatment'] },
  { point: 'crawl_termites', when: yes, reason: 'Evidence of termites (crawlspace)', itemNames: ['Termidor HE Termite Treatment'] },
  { point: 'attic_termites', when: yes, reason: 'Evidence of termites (attic)', itemNames: ['Termidor HE Termite Treatment'] },
  { point: 'attic_insulation_depth', when: v => v !== '' && Number(v) < ATTIC_R49_INCHES, reason: `Attic insulation under ${ATTIC_R49_INCHES} in`, itemNames: ['Attic Insulation R-49 (13 in), removal 10 in or less'] },
  { point: 'crawl_rodents', when: yes, reason: 'Rodents in crawlspace', itemNames: ['Talent Plus'] },
  { point: 'attic_rodents', when: yes, reason: 'Rodents in attic', itemNames: ['Talent Plus'], note: 'Consider attic remediation' },
  { point: 'int_rodents', when: yes, reason: 'Rodents inside', itemNames: ['Talent Plus'] },
  { point: 'int_droppings', when: yes, reason: 'Droppings inside', itemNames: ['Talent Plus'] },
  { point: 'int_pests', when: yes, reason: 'Pests inside', itemNames: ['Talent Basic (not advertised)', 'Talent Plus'] },
  { point: 'ext_nearby_water', when: yes, reason: 'Standing water nearby', itemNames: ['Talent Premium'], note: 'Mosquito coverage' },
  { point: 'ext_prior_termite_treatment', when: v => v.startsWith('Yes'), reason: 'Prior termite treatment', itemNames: ['Termite Warranty'], note: 'Review bond / renewal' },
  { point: 'ext_gutters_clear', when: v => v === 'No', reason: 'Gutters not clear', itemNames: [], note: 'Refer out: gutter cleaning' },
  { point: 'ext_trees_over_roof', when: yes, reason: 'Trees over roof', itemNames: [], note: 'Recommend trimming (rodent access)' },
];

export function suggest(input: Answers): Suggestion[] {
  // The moisture rule reads the highest of the five readings.
  const m = maxMoisture(input);
  const answers: Answers = { ...input, crawl_moisture_max: { value: m == null ? '' : String(m) } };
  return RULES.filter(r => { const a = answers[r.point]; return a && r.when(a.value); })
    .map(({ point, reason, itemNames, note }) => ({ point, reason, itemNames, note }));
}
