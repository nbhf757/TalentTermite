import { describe, expect, it } from 'vitest';
import { ageDays, summarize, type OpenRow } from './openProposals';

const now = new Date('2026-11-24T12:00:00Z');
const row = (n: number, daysAgo: number, total: number): OpenRow => ({
  id: String(n), number: n, status: 'sent', total, brand: 'talent_foundation', client_ref: null,
  sent_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(), updated_at: null,
  customer: 'C', address: '', rep: 'R', app_draft: null,
});

describe('open proposals', () => {
  it('counts age in whole days', () => {
    expect(ageDays(new Date(now.getTime() - 36 * 3_600_000).toISOString(), now)).toBe(1);
    expect(ageDays(null, now)).toBe(0);
  });

  it('sorts oldest first and flags ones open over 30 days', () => {
    const s = summarize([row(1, 3, 1000), row(2, 45, 2500.5), row(3, 31, 500), row(4, 30, 100)], now);
    expect(s.rows.map(r => r.number)).toEqual([2, 3, 4, 1]);
    expect(s.count).toBe(4);
    expect(s.value).toBe(4100.5);
    expect(s.stale).toBe(2);
  });
});
