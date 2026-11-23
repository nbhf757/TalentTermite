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
