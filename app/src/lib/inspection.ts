import form from '../../../config/inspection_27_point.json';

export type PointType = 'yes_no' | 'yes_no_na' | 'percent_or_na' | 'inches' | 'choice';
export interface Point { key: string; label: string; type: PointType; options?: string[] }
export interface InspectionSection { key: string; title: string; points: Point[] }

export const SECTIONS = form.sections as InspectionSection[];
export const ALL_POINTS = SECTIONS.flatMap(s => s.points);

/** A point's answer: 'Yes' | 'No' | 'N/A' | a choice label | a number as text. */
export interface Answer { value: string; note?: string }
export type Answers = Record<string, Answer>;

export const optionsFor = (p: Point): string[] | null => {
  switch (p.type) {
    case 'yes_no': return ['Yes', 'No'];
    case 'yes_no_na': return ['Yes', 'No', 'N/A'];
    case 'choice': return p.options ?? [];
    default: return null; // numeric entry
  }
};

export const isAnswered = (p: Point, a?: Answer) => {
  if (!a || a.value.trim() === '') return false;
  if (p.type === 'percent_or_na' || p.type === 'inches') return a.value === 'N/A' || Number.isFinite(Number(a.value));
  return (optionsFor(p) ?? []).includes(a.value);
};

export function progress(answers: Answers) {
  const done = ALL_POINTS.filter(p => isAnswered(p, answers[p.key])).length;
  const missing = ALL_POINTS.filter(p => !isAnswered(p, answers[p.key])).map(p => p.key);
  return { done, total: ALL_POINTS.length, complete: done === ALL_POINTS.length, missing };
}

// Nathan 2026-11-23: five wood moisture readings in the crawl space.
export const MOISTURE_KEYS = ['crawl_moisture_fr', 'crawl_moisture_fl', 'crawl_moisture_rr', 'crawl_moisture_rl', 'crawl_moisture_center'];
export const WOOD_MOISTURE_PCT = 20; // DRAFT threshold
export const ATTIC_R49_INCHES = 13;

/** Highest of the moisture readings entered, or null when none are numbers. */
export function maxMoisture(answers: Answers): number | null {
  const nums = MOISTURE_KEYS.map(k => answers[k]?.value ?? '').filter(v => v.trim() !== '' && Number.isFinite(Number(v))).map(Number);
  return nums.length ? Math.max(...nums) : null;
}

// Answers that point to a problem. When any are present the rep must write inspection comments.
const yes = (v: string) => v === 'Yes', no = (v: string) => v === 'No';
const NEGATIVE: Record<string, (v: string) => boolean> = {
  crawl_ventilation: no, crawl_musty: yes, crawl_standing_water: yes,
  crawl_vapor_barrier: v => v === 'Needs Attention',
  crawl_damaged_wood: yes, crawl_foundation_cracks: yes, crawl_fungus: yes, crawl_rodents: yes,
  crawl_entry_points: yes, crawl_termites: yes,
  attic_ventilation: no, attic_insulation_depth: v => v.trim() !== '' && Number(v) < ATTIC_R49_INCHES,
  attic_rodents: yes, attic_entry_points: v => v === 'Needs Attention', attic_termites: yes,
  int_pests: yes, int_droppings: yes, int_rodents: yes, int_entry_points: yes,
  ext_trees_over_roof: yes, ext_window_screens: no, ext_nearby_water: yes, ext_gutters_clear: no, ext_brick_cracks: yes,
  ...Object.fromEntries(MOISTURE_KEYS.map(k => [k, (v: string) => v.trim() !== '' && Number(v) >= WOOD_MOISTURE_PCT])),
};
export const isNegative = (key: string, a?: Answer) => !!a && !!NEGATIVE[key]?.(a.value);
/** Labels of the points whose answers need attention, in form order. */
export const negativePoints = (answers: Answers) => ALL_POINTS.filter(p => isNegative(p.key, answers[p.key])).map(p => p.label);
export const commentsMissing = (answers: Answers, comments: string) => negativePoints(answers).length > 0 && comments.trim() === '';
