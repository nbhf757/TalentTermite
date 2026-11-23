// Keeps the in-progress proposal on the device so a refresh, dead battery, or lost signal never loses work.
const KEY = 'talent.draft.v1';

export function loadDraft<T>(): T | null {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
export function saveDraft<T>(d: T) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage full or blocked */ }
}
export function clearDraft() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
