// Sends a signed proposal to the server (Edge Function submit-proposal), which saves it, makes the PDF,
// and emails the customer. Signing works offline: the signed proposal waits on the device and is sent
// as soon as the rep is signed in and online. A retry never creates a second proposal (client_ref).
import type { Section } from './footprint';
import { computeSection } from './footprint';
import type { Answers } from './inspection';
import { buildProposalDoc, proposalView, savedLines, type ProposalInput } from './proposalDoc';
import { supabase } from './supabase';

export type SubmitResult = { proposal_id: string; number: number; status: 'sent' | 'signed'; emailed: boolean; email_note?: string;
  fr?: { document_id?: string; task_ids?: string[]; note?: string } };

export type SubmitInput = ProposalInput & {
  clientRef: string; sections: Section[]; answers: Answers;
  customerSig: string | null; repSig: string | null; signedAt: string | null; // all null = save unsigned
};

export function buildSubmission(i: SubmitInput) {
  const v = proposalView(i);
  return {
    client_ref: i.clientRef,
    brand: i.brand,
    customer: i.customer,
    signed_at: i.signedAt,
    price_book: { source: i.book.source, loaded_at: i.book.loadedAt },
    quote: {
      subtotal: v.quote.subtotal, discount_pct: v.quote.discountPct, discount_amount: v.quote.discountAmount,
      total: v.quote.total, discount_status: v.quote.discountStatus, approver: i.work.approver || null,
      down_amount: v.down.amount, down_pct: v.down.pct,
    },
    payment_method: i.method,
    lines: savedLines(i),
    drawings: i.sections.map(s => {
      const r = computeSection(s);
      return {
        area_type: s.areaType, label: s.label ?? null, include_in_totals: s.includeInTotals,
        walls: s.walls.map(w => ({ len_ft: w.lengthFt, dir_deg: w.dirDeg })),
        calc_perimeter_lf: r.calcPerimeterLf, calc_area_sf: r.calcAreaSf,
        override_perimeter_lf: s.overridePerimeterLf ?? null, override_area_sf: s.overrideAreaSf ?? null,
        override_reason: s.overrideReason ?? null, closure_gap_ft: r.closureGapFt,
      };
    }),
    answers: Object.entries(i.answers).map(([point_key, a]) => ({ point_key, answer: a.value, notes: a.note ?? null })),
    comments: i.comments,
    top_down_ack: !!i.work.topDownAck,
    doc: buildProposalDoc(i, i.signedAt ? new Date(i.signedAt) : new Date()),
    signatures: i.signedAt && i.customerSig && i.repSig ? { customer: i.customerSig, rep: i.repSig } : null,
  };
}

export async function submitProposal(payload: ReturnType<typeof buildSubmission>): Promise<SubmitResult> {
  if (!supabase) throw new Error('The app is not connected to the server.');
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) throw new Error('Sign in to send this proposal to the office.');
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('Offline. It will send when you are back online.');
  const { data, error } = await supabase.functions.invoke('submit-proposal', { body: payload });
  if (error) {
    let msg = error.message;
    try { const body = await (error as { context?: Response }).context?.json(); if (body?.error) msg = body.error; } catch { /* keep message */ }
    throw new Error(msg);
  }
  return data as SubmitResult;
}
