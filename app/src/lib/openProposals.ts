// Open proposals: saved but not signed yet. Reps see their own (row-level security); managers and office see all.
// John's goal: no proposal stays open more than a month.
import { supabase } from './supabase';

export const STALE_DAYS = 30;

export type OpenRow = {
  id: string; number: number; status: string; total: number; brand: string;
  client_ref: string | null; sent_at: string | null; updated_at: string | null;
  customer: string; address: string; rep: string;
  app_draft: Record<string, unknown> | null;
};

export const ageDays = (sentAt: string | null, now = new Date()) =>
  sentAt ? Math.max(0, Math.floor((now.getTime() - new Date(sentAt).getTime()) / 86_400_000)) : 0;

/** Oldest first, with totals for the summary line. */
export function summarize(rows: OpenRow[], now = new Date()) {
  const sorted = [...rows].sort((a, b) => ageDays(b.sent_at, now) - ageDays(a.sent_at, now));
  return {
    rows: sorted,
    count: rows.length,
    value: rows.reduce((s, r) => s + r.total, 0),
    stale: rows.filter(r => ageDays(r.sent_at, now) > STALE_DAYS).length,
  };
}

type Raw = {
  id: string; number: number; status: string; total: number | string; brand: string; client_ref: string | null;
  sent_at: string | null; updated_at: string | null; app_draft: Record<string, unknown> | null;
  customer: { first_name: string | null; last_name: string | null; address: string | null; city: string | null } | null;
  rep: { full_name: string | null } | null;
};

export async function loadOpenProposals(): Promise<OpenRow[]> {
  if (!supabase) throw new Error('The app is not connected to the server.');
  const { data, error } = await supabase.from('proposals')
    .select('id,number,status,total,brand,client_ref,sent_at,updated_at,app_draft,customer:customers(first_name,last_name,address,city),rep:profiles!proposals_rep_id_fkey(full_name)')
    .in('status', ['sent', 'viewed']).order('sent_at', { ascending: true }).limit(500);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Raw[]).map(r => ({
    id: r.id, number: r.number, status: r.status, total: Number(r.total), brand: r.brand,
    client_ref: r.client_ref, sent_at: r.sent_at, updated_at: r.updated_at, app_draft: r.app_draft,
    customer: `${r.customer?.first_name ?? ''} ${r.customer?.last_name ?? ''}`.trim() || 'Unknown customer',
    address: [r.customer?.address, r.customer?.city].filter(Boolean).join(', '),
    rep: r.rep?.full_name ?? '',
  }));
}

export async function markLost(id: string, reason: string) {
  if (!supabase) throw new Error('The app is not connected to the server.');
  const { error } = await supabase.from('proposals')
    .update({ status: 'lost', lost_at: new Date().toISOString(), lost_reason: reason.trim() || null }).eq('id', id);
  if (error) throw new Error(error.message);
}
