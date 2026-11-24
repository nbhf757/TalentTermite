// Saves a proposal from the rep app and renders its PDF. Signed: status 'signed', signatures saved, customer emailed.
// Unsigned (no signatures sent): status 'sent', PDF marked NOT SIGNED. Saving again with the same client_ref
// updates an unsigned proposal (e.g. the customer signs later); a signed proposal is never changed.
// The rep path requires a signed-in Talent user (checked in code). Writes with the service role because signatures are server-written only.
// Email: Microsoft 365 (Graph) as office@, when the MS_* and MAIL_FROM secrets are set. Without them the proposal still saves.
// Request: POST the payload from app/src/lib/submit.ts (buildSubmission).
// Response: { proposal_id, number, status, emailed, email_note? }
// Email to sign (Nathan 2026-11-24): an unsigned save with email_to_sign emails the customer the PDF and a private link
// (APP_URL/?sign=<token>, 30 days). The customer page calls this function with { action: 'view' | 'sign', token }.
// Those two actions need no login (the token is the key); everything else needs a signed-in Talent user.
// Deployed with verify_jwt off for that reason: the rep path checks the user's JWT itself below.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1';
import { buildBom, type Bom, type Recipe } from './bom.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Block = { kind: 'h' | 'sub' | 'p' | 'small' | 'li' | 'row' | 'qr'; text: string; right?: string; bold?: boolean; png?: string };
type Doc = {
  brand: string; date: string; customerLines: string[]; blocks: Block[];
  company: { legal: string; address: string; license: string; phone: string; email: string };
};
type Payload = {
  client_ref: string; brand: 'talent_pest' | 'talent_foundation'; signed_at: string | null;
  customer: Record<string, string | null>;
  price_book: { source: string; loaded_at: string | null };
  quote: { subtotal: number; discount_pct: number; discount_amount: number; total: number; discount_status: string; approver: string | null; down_amount: number; down_pct: number };
  payment_method: '' | 'check_cash' | 'card' | 'finance_sac' | 'finance_5yr';
  lines: Record<string, unknown>[]; drawings: Record<string, unknown>[];
  answers: { point_key: string; answer: string; notes: string | null }[];
  comments: string; top_down_ack: boolean; doc: Doc; app_draft?: Record<string, unknown> | null;
  signatures?: { customer: string; rep: string } | null;
  email_to_sign?: boolean;
};
/** What the sold-job steps need, from the rep's payload or from the saved proposal (customer signed online). */
type SoldInfo = { payment_method: Payload['payment_method']; doc: Doc; quote: { total: number; down_amount: number } };

const APPROVAL: Record<string, string> = { none: 'none', ok: 'none', manager_flag: 'manager_flag', needs_approval: 'approved' };

// ---------- PDF ----------
// Standard fonts only cover WinAnsi; swap the few characters the app uses that it can't encode.
const clean = (s: string) => s
  .replace(/[\u2212\u2010\u2011]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
  .replace(/\u2026/g, '...').replace(/\u2265/g, '>=').replace(/\u2264/g, '<=')
  .replace(/[^\x20-\x7E\u00a0-\u00ff\u2013\u2014\u2022\u20ac\u2122]/g, '');

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const t = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(t, size) <= width || !line) line = t;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

async function renderPdf(doc: Doc, number: number, sigs: { customer: Uint8Array; rep: Uint8Array | null } | null,
  names: { customer: string; rep: string }, signedAt: string | null) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.brand} proposal #${number}`); pdf.setAuthor(doc.company.legal);
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 50, CW = W - 2 * M;
  const ink = rgb(0.1, 0.1, 0.1), muted = rgb(0.4, 0.4, 0.4), accent = rgb(0.05, 0.3, 0.45);
  let page: PDFPage = pdf.addPage([W, H]); let y = H - M;
  const ensure = (h: number) => { if (y - h < M + 20) { page = pdf.addPage([W, H]); y = H - M; } };
  const text = (s: string, x: number, size: number, f = reg, color = ink) => page.drawText(clean(s), { x, y, size, font: f, color });
  const para = (s: string, size: number, f = reg, color = ink, indent = 0, gap = 4) => {
    for (const l of wrap(s, f, size, CW - indent)) { ensure(size + 3); y -= size + 3; text(l, M + indent, size, f, color); }
    y -= gap;
  };

  // Header
  y -= 20; text(doc.brand, M, 20, bold, accent);
  const right = [`Proposal #${number}`, doc.date, ...doc.customerLines];
  let ry = H - M - 12;
  for (const [i, l] of right.entries()) {
    const f = i === 0 ? bold : reg, s = clean(l).slice(0, 70);
    page.drawText(s, { x: W - M - f.widthOfTextAtSize(s, 10), y: ry, size: 10, font: f, color: i ? muted : ink }); ry -= 13;
  }
  y -= 14; text(`${doc.company.legal} \u00b7 ${doc.company.address}`, M, 9, reg, muted);
  y -= 12; text(`${doc.company.license} \u00b7 ${doc.company.phone} \u00b7 ${doc.company.email}`, M, 9, reg, muted);
  y = Math.min(y, ry) - 14;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: accent }); y -= 8;

  for (let bi = 0; bi < doc.blocks.length; bi++) {
    const b = doc.blocks[bi];
    switch (b.kind) {
      case 'qr': {
        // Consecutive QR blocks sit side by side, each with its caption under it.
        const run: Block[] = [];
        while (bi < doc.blocks.length && doc.blocks[bi].kind === 'qr') run.push(doc.blocks[bi++]);
        bi--;
        const size = 96, colW = 200; ensure(size + 40); y -= 6; const top = y;
        let col = 0;
        for (const q of run) {
          const bytes = q.png && q.png.length < 40_000 ? Uint8Array.from(atob(q.png), c => c.charCodeAt(0)) : null;
          if (!bytes) continue;
          const img = await pdf.embedPng(bytes); const x = M + col * colW;
          page.drawImage(img, { x, y: top - size, width: size, height: size });
          let cy = top - size - 11;
          for (const l of wrap(q.text, reg, 8.5, colW - 10)) { page.drawText(clean(l), { x, y: cy, size: 8.5, font: reg, color: ink }); cy -= 10; }
          col++;
        }
        y = top - size - 34; break;
      }
      case 'h': ensure(40); y -= 10; para(b.text, 13, bold, accent, 0, 2); break;
      case 'sub': ensure(30); y -= 4; para(b.text, 11, bold); break;
      case 'p': para(b.text, 10); break;
      case 'small': para(b.text, 8.5, reg, muted); break;
      case 'li': {
        const lines = wrap(b.text, reg, 10, CW - 14);
        lines.forEach((l, i) => { ensure(13); y -= 13; if (i === 0) text('\u2022', M + 2, 10); text(l, M + 14, 10); });
        y -= 3; break;
      }
      case 'row': {
        ensure(16); y -= 15; const f = b.bold ? bold : reg, size = b.bold ? 12 : 10, r = clean(b.right ?? '');
        text(b.text, M + CW / 2, size, f); page.drawText(r, { x: W - M - f.widthOfTextAtSize(r, size), y, size, font: f, color: ink });
        break;
      }
    }
  }

  if (!sigs || !signedAt) {
    // Unsigned copy for the customer file
    ensure(90); y -= 16; para('Not signed', 13, bold, rgb(0.7, 0.2, 0.1), 0, 4);
    para(`This proposal has not been accepted. Prepared by ${names.rep}. To accept, call us at ${doc.company.phone}.`, 10);
    for (const p of pdf.getPages()) {
      p.drawText('NOT SIGNED', { x: W - M - bold.widthOfTextAtSize('NOT SIGNED', 9), y: 28, size: 9, font: bold, color: rgb(0.7, 0.2, 0.1) });
    }
  } else {
    // Signatures
    ensure(170); y -= 16; para('Accept and sign', 13, bold, accent, 0, 6);
    const when = new Date(signedAt).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' }) + ' ET';
    const boxW = (CW - 20) / 2, boxH = 70, top = y;
    for (const [i, [label, png, name]] of ([['Customer', sigs.customer, names.customer], ['Talent representative', sigs.rep, names.rep]] as const).entries()) {
      const x = M + i * (boxW + 20);
      if (png) {
        const img = await pdf.embedPng(png); const scale = Math.min(boxW / img.width, boxH / img.height);
        page.drawImage(img, { x, y: top - boxH, width: img.width * scale, height: img.height * scale });
      } else page.drawText('Prepared and sent for e-signature', { x, y: top - boxH + 8, size: 9, font: reg, color: muted });
      page.drawLine({ start: { x, y: top - boxH - 4 }, end: { x: x + boxW, y: top - boxH - 4 }, thickness: 0.75, color: muted });
      page.drawText(clean(`${label}: ${name}`), { x, y: top - boxH - 16, size: 9, font: bold, color: ink });
      if (png || i === 0) page.drawText(clean(`Signed ${when}${!sigs.rep ? ' (online)' : ''}`), { x, y: top - boxH - 28, size: 8.5, font: reg, color: muted });
    }
    y = top - boxH - 40;
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(clean(`${doc.brand} \u00b7 Proposal #${number} \u00b7 Page ${i + 1} of ${pages.length}`),
    { x: M, y: 28, size: 8, font: reg, color: muted }));
  return await pdf.save();
}

// ---------- helpers ----------
const pngBytes = (dataUrl: string) => {
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl ?? '');
  if (!m) throw new Error('Signature image is missing.');
  return Uint8Array.from(atob(m[1]), c => c.charCodeAt(0));
};
const b64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const sha256 = async (bytes: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// Email goes out through Microsoft 365 as office@talenttermite.com (Microsoft Graph, app-only).
// Secrets: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MAIL_FROM (office@talenttermite.com).
// The Azure app is limited in Exchange to sending as that one mailbox. Sent mail lands in its Sent Items.
type Mail = { to: string[]; subject: string; html: string; attachments: { filename: string; content: string }[]; fromName: string };
let graphToken: { value: string; exp: number } | null = null;
async function msToken() {
  if (graphToken && graphToken.exp > Date.now() + 60_000) return graphToken.value;
  const tenant = Deno.env.get('MS_TENANT_ID'), id = Deno.env.get('MS_CLIENT_ID'), secret = Deno.env.get('MS_CLIENT_SECRET');
  if (!tenant || !id || !secret) return null;
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST', body: new URLSearchParams({ client_id: id, client_secret: secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Microsoft sign-in failed: ${String(d.error_description ?? d.error ?? r.status).slice(0, 160)}`);
  graphToken = { value: d.access_token, exp: Date.now() + Number(d.expires_in ?? 3000) * 1000 };
  return graphToken.value;
}
async function sendEmail(m: Mail) {
  const from = Deno.env.get('MAIL_FROM');
  let token: string | null;
  try { token = await msToken(); } catch (e) { return { ok: false, note: (e as Error).message, response: '' }; }
  if (!token || !from) return { ok: false, note: 'Email is not set up yet.' };
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      saveToSentItems: true,
      message: {
        subject: m.subject, body: { contentType: 'HTML', content: m.html },
        toRecipients: m.to.map(address => ({ emailAddress: { address } })),
        attachments: m.attachments.map(a => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: a.filename, contentType: 'application/pdf', contentBytes: a.content })),
      },
    }),
  });
  const body = await r.text();
  return r.ok ? { ok: true, note: undefined, response: body || 'accepted' } : { ok: false, note: `Email failed (${r.status}).`, response: body.slice(0, 500) };
}

// Nathan 2026-11-24: card customers are sent to their FieldRoutes customer portal to enter the card.
async function portalUrl(db: Db): Promise<string | null> {
  const { data } = await db.from('app_settings').select('value').eq('key', 'customer_portal').maybeSingle();
  const u = (data?.value as { url?: unknown } | undefined)?.url;
  return typeof u === 'string' && /^https:\/\//.test(u) ? u : null;
}

// Nathan 2026-11-24: customers don't know their portal login. First time: "Get Login Info" texts a reset code,
// then they set a password using their account number (= FieldRoutes customer ID) and that code.
const forgotUrl = (portal: string) => { try { return new URL('/forgotPassword', portal).toString(); } catch { return portal; } };

async function emailCustomer(to: string, firstName: string, brand: string, phone: string, number: number, pdf: Uint8Array, cardPortal: string | null | false, account: string | null) {
  const acct = account ? `<strong>${esc(account)}</strong>` : 'shown in the text you receive';
  const card = cardPortal === false ? '' : cardPortal
    ? `<p><strong>Next step: add your card.</strong> We never see or store your card number. It goes into your secure customer portal:</p>
<ol><li>Open <a href="${esc(forgotUrl(cardPortal))}">your customer portal's Get Login Info page</a>.</li>
<li>Enter the mobile number on your account. We'll text you a reset code.</li>
<li>On the reset page, enter your account number (${acct}), the code, and a new password.</li>
<li>Sign in at <a href="${esc(cardPortal)}">${esc(cardPortal)}</a> and add your card under billing.</li></ol>
<p>Already have a login? Just sign in. Prefer the phone? Call us at ${esc(phone)}.</p>`
    : `<p><strong>Next step: your card.</strong> Our office will call you to add your card securely, or you can add it in your customer portal.</p>`;
  const e = await sendEmail({
    to: [to], fromName: brand, subject: `Your signed ${brand} proposal (#${number})`,
    html: `<p>Hi ${esc(firstName || 'there')},</p><p>Thank you for choosing ${esc(brand)}. Your signed proposal is attached.</p>` + card +
      `<p>Our office will contact you to schedule. Questions? Call us at ${esc(phone)}.</p><p>${esc(brand)}</p>`,
    attachments: [{ filename: `${brand.replace(/\s+/g, '-')}-proposal-${number}.pdf`, content: b64(pdf) }],
  });
  return e.ok ? e : { ...e, note: e.note === 'Email is not set up yet.' ? 'Customer email is not set up yet. The office has the signed PDF.' : `${e.note} The office has the signed PDF.` };
}

// ---------- Bill of materials ----------
// Nathan 2026-11-24: the materials list goes to Lindsey and the office. Override with secret BOM_EMAIL_TO (comma list).
const bomRecipients = () => (Deno.env.get('BOM_EMAIL_TO') || 'lindsey@talenttermite.com,office@talenttermite.com')
  .split(',').map(x => x.trim()).filter(Boolean);

async function makeBom(db: Db, lines: Record<string, unknown>[]): Promise<Bom> {
  const sold = lines.map(l => ({ price_item_id: (l.price_item_id as string | null) ?? null, name: String(l.name ?? ''), qty: Number(l.qty ?? 0) }));
  const ids = [...new Set(sold.map(l => l.price_item_id).filter((x): x is string => !!x))];
  const { data } = ids.length
    ? await db.from('price_item_recipe').select('price_item_id, material_id, qty_per_unit, fixed_qty, draft, material:materials(name, unit, unit_cost, supplier, sort_order, active)').in('price_item_id', ids).throwOnError()
    : { data: [] };
  const recipes = ((data ?? []) as unknown as (Recipe & { material: Recipe['material'] & { active: boolean } })[]).filter(r => r.material?.active !== false);
  return buildBom(sold, recipes);
}

async function renderBomPdf(bom: Bom, doc: Doc, number: number, repName: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Materials list, proposal #${number}`);
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 40;
  const ink = rgb(0.1, 0.1, 0.1), muted = rgb(0.4, 0.4, 0.4), warn = rgb(0.7, 0.3, 0.0);
  let page = pdf.addPage([W, H]); let y = H - M;
  const t = (s: string, x: number, size = 9, f = reg, color = ink) => page.drawText(clean(s), { x, y, size, font: f, color });
  const next = (h: number) => { y -= h; if (y < M + 20) { page = pdf.addPage([W, H]); y = H - M - h; } };
  next(16); t(`Materials list - proposal #${number}`, M, 15, bold);
  next(14); t(`${doc.brand} - ${doc.customerLines.slice(0, 2).join(' - ')}`, M, 9.5, reg, muted);
  next(12); t(`Sold by ${repName} - ${doc.date}`, M, 9.5, reg, muted);
  if (bom.has_draft) { next(14); t('DRAFT quantities: some recipes are not confirmed yet. Check before ordering.', M, 9.5, bold, warn); }
  const cols = [M, M + 40, M + 80, M + 380, M + 420];
  next(20); ['Order', 'Unit', 'Material', 'Need', 'For'].forEach((h, i) => t(h, cols[i], 9, bold));
  page.drawLine({ start: { x: M, y: y - 3 }, end: { x: W - M, y: y - 3 }, thickness: 0.5, color: muted });
  for (const r of bom.rows) {
    next(14);
    t(String(r.order), cols[0], 10, bold); t(r.unit, cols[1]); t(r.material.slice(0, 66), cols[2], 8.5);
    t(String(r.need), cols[3], 9, reg, muted); t(r.for_items.map(n => n.replace(/\s*\(.*\)$/, '')).join(', ').slice(0, 30), cols[4], 8, reg, muted);
  }
  if (!bom.rows.length) { next(14); t('No materials are set up for the items on this job.', M); }
  if (bom.no_recipe.length) {
    next(22); t('No materials set up for:', M, 9, bold);
    for (const n of bom.no_recipe) { next(12); t(`- ${n}`, M + 8, 9, reg, muted); }
  }
  if (bom.est_cost != null) { next(20); t(`Estimated material cost: ${bom.est_cost.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`, M, 10, bold); }
  return await pdf.save();
}

// ---------- FieldRoutes write-back ----------
// Keys live only in Supabase secrets FR_SUBDOMAIN, FR_AUTH_KEY, FR_AUTH_TOKEN. Every call is logged to fr_sync_log.
type Db = ReturnType<typeof createClient>;
const frBase = () => { const s = Deno.env.get('FR_SUBDOMAIN'); return s ? `https://${s}.fieldroutes.com/api` : null; };
const frAuth = () => ({ authenticationKey: Deno.env.get('FR_AUTH_KEY') ?? '', authenticationToken: Deno.env.get('FR_AUTH_TOKEN') ?? '' });

async function frCall(db: Db, proposalId: string, action: string, path: string, body: FormData | URLSearchParams, logParams: Record<string, unknown>) {
  const r = await fetch(`${frBase()}/${path}`, { method: 'POST', body });
  const text = await r.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
  const ok = r.ok && data.success !== false;
  const { params: _p, tokenUsage: _t, ...resp } = data; // never log echoed auth params
  await db.from('fr_sync_log').insert({ proposal_id: proposalId, action, request: logParams, response: { status: r.status, ...resp }, ok });
  if (!ok) throw new Error(`FieldRoutes ${action} failed (${r.status}): ${String(data.errorMessage ?? data.message ?? text).slice(0, 200)}`);
  return data;
}

async function frUploadPdf(db: Db, proposalId: string, frCustomerId: string, pdf: Uint8Array, filename: string, description: string, showCustomer: boolean) {
  const fd = new FormData();
  const a = frAuth();
  fd.set('customerID', frCustomerId); fd.set('description', description);
  fd.set('showCustomer', showCustomer ? '1' : '0'); fd.set('showTech', '0');
  fd.set('uploadFile', new Blob([pdf], { type: 'application/pdf' }), filename);
  fd.set('authenticationKey', a.authenticationKey); fd.set('authenticationToken', a.authenticationToken);
  const d = await frCall(db, proposalId, 'document_upload', 'document/create', fd, { customerID: frCustomerId, description, filename, bytes: pdf.length });
  return String(d.result ?? '');
}

async function frEmployeeId(db: Db, proposalId: string, fname: string, lname: string) {
  const d = await frCall(db, proposalId, 'employee_search', 'employee/search',
    new URLSearchParams({ fname, lname, active: '1', includeData: '1', ...frAuth() }), { fname, lname });
  const ids = (d.employeeIDs ?? []) as (string | number)[];
  const rows = (d.employees ?? []) as { employeeID?: string | number; fname?: string; lname?: string }[];
  const lc = (x?: string) => (x ?? '').trim().toLowerCase();
  const exact = rows.find(e => lc(e.fname) === lc(fname) && lc(e.lname) === lc(lname))
    ?? (rows.filter(e => lc(e.lname) === lc(lname)).length === 1 ? rows.find(e => lc(e.lname) === lc(lname)) : undefined);
  return String(exact?.employeeID ?? (ids.length === 1 ? ids[0] : '')) || null;
}

async function frSoldTasks(db: Db, proposalId: string, frCustomerId: string, text: string) {
  const { data: setting } = await db.from('app_settings').select('value').eq('key', 'sold_task').maybeSingle();
  const cfg = (setting?.value ?? {}) as { mode?: string; category?: number; due_days?: number; people?: { fname: string; lname: string }[] };
  const people = (cfg.people ?? []).slice(0, cfg.mode === 'first' ? 1 : undefined);
  const due = new Date(Date.now() + (cfg.due_days ?? 1) * 86400000).toISOString().slice(0, 10);
  const ids: string[] = [], problems: string[] = [];
  for (const [i, person] of people.entries()) {
    const type = cfg.mode === 'lead_alerts' && i > 0 ? '1' : '0'; // 0 = task, 1 = alert
    try {
      const emp = await frEmployeeId(db, proposalId, person.fname, person.lname);
      if (!emp) { problems.push(`${person.fname} ${person.lname} not found in FieldRoutes`); continue; }
      const d = await frCall(db, proposalId, 'task_create', 'task/create', new URLSearchParams({
        type, customerID: frCustomerId, category: String(cfg.category ?? 2), assignedTo: emp,
        dueDate: due, task: text, status: '0', ...frAuth(),
      }), { type, customerID: frCustomerId, assignedTo: emp, category: cfg.category ?? 2, dueDate: due, task: text });
      ids.push(String(d.result ?? ''));
    } catch (e) { problems.push((e as Error).message); }
  }
  return { ids, problems };
}

/** Uploads the PDF to the customer's FieldRoutes record; on a signed job also creates the scheduling task(s).
 *  Never fails the save: problems are returned as a note and logged. */
async function writeBack(db: Db, id: string, number: number, frCustomerId: string | null, pdf: Uint8Array, signed: boolean, p: SoldInfo, repName: string) {
  if (!frCustomerId) return { note: 'Customer is not in FieldRoutes yet, so nothing was sent there. Pick the customer from the FieldRoutes search to link them.' };
  if (!frBase()) return { note: 'FieldRoutes is not connected.' };
  const out: { document_id?: string; task_ids?: string[]; note?: string } = {};
  const notes: string[] = [];
  const { data: setting } = await db.from('app_settings').select('value').eq('key', 'sold_task').maybeSingle();
  const cfg = (setting?.value ?? {}) as { upload_unsigned?: boolean; show_customer_signed?: boolean };
  if (!signed) {
    if (cfg.upload_unsigned === false) return { note: 'Unsigned proposals are not sent to FieldRoutes (setting).' };
    const { data: prev } = await db.from('proposals').select('fr_document_id').eq('id', id).maybeSingle();
    if (prev?.fr_document_id) return { document_id: prev.fr_document_id, note: 'The first unsigned copy is already in FieldRoutes; the signed copy will be added when it is signed.' };
  }
  try {
    const desc = signed ? `Signed proposal #${number} (${p.doc.brand})` : `Proposal #${number} - NOT SIGNED (${p.doc.brand})`;
    out.document_id = await frUploadPdf(db, id, frCustomerId, pdf, `proposal-${number}${signed ? '-signed' : ''}.pdf`, desc, signed && !!cfg.show_customer_signed);
    await db.from('proposals').update({ fr_document_id: out.document_id }).eq('id', id);
  } catch (e) { notes.push(`PDF not uploaded to FieldRoutes: ${(e as Error).message}`); }
  if (signed) {
    const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    const pay = p.payment_method.startsWith('finance') ? 'Regions Bank financing - approval needed before scheduling' : p.payment_method === 'card' ? 'card - customer adds it in the FieldRoutes portal; call if it is not on file' : (p.payment_method || 'not chosen');
    const text = `SOLD - schedule proposal #${number} (${p.doc.brand}). Total ${money(p.quote.total)}` +
      (p.quote.down_amount > 0 ? `, ${money(p.quote.down_amount)} down` : '') + `. Payment: ${pay}. Rep: ${repName}. Signed PDF is in Documents.`;
    const t = await frSoldTasks(db, id, frCustomerId, text);
    out.task_ids = t.ids; notes.push(...t.problems);
    if (t.ids.length) await db.from('proposals').update({ fr_task_ids: t.ids }).eq('id', id);
  }
  if (notes.length) out.note = notes.join(' ');
  return out;
}


// ---------- after a proposal is signed (in person or online) ----------
const store = (db: Db) => (path: string, body: Uint8Array, contentType: string) =>
  db.storage.from('proposals').upload(path, body, { contentType, upsert: true }).then(r => { if (r.error) throw r.error; });

type Signed = { id: string; number: number; pdf: Uint8Array; frCustomerId: string | null; email: string | null; firstName: string;
  names: { customer: string; rep: string }; p: SoldInfo; lines: Record<string, unknown>[] };
/** Customer copy, materials list and FieldRoutes. Never throws for email/BOM/FR problems: they come back as notes. */
async function finishSigned(db: Db, s: Signed) {
  const { id, number, pdf, p, names } = s;
  const dir = `${number}`, up = store(db), c = { email: s.email, first_name: s.firstName }, cust = { fr_customer_id: s.frCustomerId };
    // Customer copy
    let emailed = false, note: string | undefined;
    if (c.email) {
      const cardPortal = p.payment_method === 'card' ? await portalUrl(db).catch(() => null) : false;
      const e = await emailCustomer(c.email, c.first_name ?? '', p.doc.brand, p.doc.company.phone, number, pdf, cardPortal, cust.fr_customer_id);
      emailed = e.ok; note = e.note;
      if ('response' in e) await db.from('fr_sync_log').insert({ proposal_id: id, action: 'email_customer', response: { body: e.response }, ok: e.ok });
      if (emailed) await db.from('proposals').update({ customer_emailed_at: new Date().toISOString() }).eq('id', id);
    } else note = 'No customer email on file, so no copy was emailed.';

    // Materials list for the office. Never fails the save.
    let bomNote: string | undefined;
    try {
      const bom = await makeBom(db, s.lines);
      const bomPdf = await renderBomPdf(bom, p.doc, number, names.rep);
      await up(`${dir}/bom.pdf`, bomPdf, 'application/pdf');
      await db.from('proposals').update({ bom, bom_pdf_path: `${dir}/bom.pdf` }).eq('id', id).throwOnError();
      const e = await sendEmail({
        to: bomRecipients(), fromName: 'Talent Proposals', subject: `Materials list - SOLD proposal #${number} (${names.customer})`,
        html: `<p>Proposal #${number} for ${esc(names.customer)} was signed. Sold by ${esc(names.rep)}.</p>` +
          `<p>The materials list is attached${bom.has_draft ? ' (some quantities are DRAFT, check before ordering)' : ''}. The signed proposal is attached too.</p>`,
        attachments: [{ filename: `materials-${number}.pdf`, content: b64(bomPdf) }, { filename: `proposal-${number}-signed.pdf`, content: b64(pdf) }],
      });
      if ('response' in e) await db.from('fr_sync_log').insert({ proposal_id: id, action: 'email_bom', response: { body: e.response }, ok: e.ok });
      bomNote = e.ok ? undefined : `Materials list saved but not emailed: ${e.note}`;
      if (cust.fr_customer_id && frBase()) {
        try { await frUploadPdf(db, id, cust.fr_customer_id, bomPdf, `materials-${number}.pdf`, `Materials list #${number}`, false); }
        catch (err) { bomNote = [bomNote, `Materials list not uploaded to FieldRoutes: ${(err as Error).message}`].filter(Boolean).join(' '); }
      }
    } catch (err) { bomNote = `Materials list failed: ${(err as Error).message}`; console.error('bom', bomNote); }

    const fr = await writeBack(db, id, number, cust.fr_customer_id, pdf, true, p, names.rep);
    return { emailed, email_note: note, bom_note: bomNote, fr };
}

// ---------- email to sign ----------
const appUrl = () => (Deno.env.get('APP_URL') || 'https://talenttermite.netlify.app').replace(/\/+$/, '');
const tokenHash = (t: string) => sha256(new TextEncoder().encode(t));
const SIGN_DAYS = 30;

async function emailToSign(db: Db, id: string, number: number, to: string | null, firstName: string, doc: Doc, pdf: Uint8Array, repName: string) {
  if (!to) return { emailed: false, note: 'No customer email on file, so the proposal was not emailed.' };
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const token = b64(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const expires = new Date(Date.now() + SIGN_DAYS * 86400000);
  await db.from('proposals').update({ sign_token_hash: await tokenHash(token), sign_expires_at: expires.toISOString(), sign_email_to: to }).eq('id', id).throwOnError();
  const link = `${appUrl()}/?sign=${token}`;
  const e = await sendEmail({
    to: [to], fromName: doc.brand, subject: `Your ${doc.brand} proposal (#${number})`,
    html: `<p>Hi ${esc(firstName || 'there')},</p><p>Thank you for meeting with ${esc(repName)}. Your proposal is attached so you can look it over.</p>` +
      `<p>When you are ready, you can review and sign it online:</p>` +
      `<p><a href="${esc(link)}" style="display:inline-block;padding:12px 18px;background:#3d7a1f;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Review and sign</a></p>` +
      `<p>This link is just for you and works until ${expires.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' })}. ` +
      `Questions? Call us at ${esc(doc.company.phone)}.</p><p>${esc(doc.brand)}</p>`,
    attachments: [{ filename: `${doc.brand.replace(/\s+/g, '-')}-proposal-${number}.pdf`, content: b64(pdf) }],
  });
  if ('response' in e) await db.from('fr_sync_log').insert({ proposal_id: id, action: 'email_sign_link', response: { body: e.response }, ok: e.ok });
  if (e.ok) await db.from('proposals').update({ sign_emailed_at: new Date().toISOString() }).eq('id', id);
  return { emailed: e.ok, note: e.ok ? undefined : (e.note === 'Email is not set up yet.' ? 'Email is not set up yet, so the proposal was saved but not emailed.' : `${e.note} The proposal was saved but not emailed.`) };
}

const METHOD_TEXT: Record<Exclude<Payload['payment_method'], ''>, string> = {
  check_cash: 'Check or cash', card: 'Card (FieldRoutes Payments)',
  finance_sac: 'Regions Bank: 9 months same as cash (loan code D4377)', finance_5yr: 'Regions Bank: 9.99% APR 5-year loan (loan code DEL2674)',
};
const FIN_NOTE = 'No penalty for early payoff. Subject to credit approval.';
/** The customer's payment choice replaces the line under "Payment" in the saved proposal. */
function withPayment(doc: Doc, method: Exclude<Payload['payment_method'], ''>): Doc {
  const blocks = [...doc.blocks];
  const h = blocks.findIndex(b => b.kind === 'h' && b.text === 'Payment');
  if (h >= 0 && blocks[h + 1]?.kind === 'p') {
    blocks[h + 1] = { kind: 'p', text: METHOD_TEXT[method] };
    if (blocks[h + 2]?.kind === 'small' && blocks[h + 2].text === FIN_NOTE) blocks.splice(h + 2, 1);
    if (method.startsWith('finance')) blocks.splice(h + 2, 0, { kind: 'small', text: FIN_NOTE });
  }
  return { ...doc, blocks };
}
const methodOf = (pm: string | null, plan: string | null): Payload['payment_method'] =>
  pm === 'financing' ? (plan === 'regions_5yr' ? 'finance_5yr' : 'finance_sac') : (pm === 'check_cash' || pm === 'card' ? pm : '');

type PublicReq = { action: 'view' | 'sign'; token?: string; updated_at?: string; name?: string; signature?: string; method?: string; agree?: boolean };
async function customerLink(db: Db, req: Request, b: PublicReq) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(b.token ?? '')) return json({ error: 'This link is not valid.' }, 404);
  type LinkRow = { id: string; number: number; status: string; doc: Doc; total: number; down_payment_amount: number | null; payment_method: string | null;
    financing_plan: string | null; updated_at: string; sign_expires_at: string | null; first_viewed_at: string | null; rep_id: string; customer: unknown; rep: unknown };
  const { data: r } = await db.from('proposals')
    .select('id, number, status, doc, total, down_payment_amount, payment_method, financing_plan, updated_at, sign_expires_at, first_viewed_at, rep_id, customer:customers(first_name, last_name, email, fr_customer_id), rep:profiles!proposals_rep_id_fkey(full_name)')
    .eq('sign_token_hash', await tokenHash(b.token!)).maybeSingle() as unknown as { data: LinkRow | null };
  if (!r) return json({ error: 'This link is not valid anymore. A newer one may have been sent, or call us.' }, 404);
  const doc = r.doc as Doc, phone = doc?.company?.phone ?? '';
  if (r.status === 'signed') return json({ signed: true, number: r.number, brand: doc.brand, phone });
  if (!['sent', 'viewed'].includes(r.status) || !r.sign_expires_at || new Date(r.sign_expires_at) < new Date())
    return json({ error: `This link has expired. Call us at ${phone} and we will send a new one.` }, 410);
  const cust = r.customer as unknown as { first_name: string | null; last_name: string | null; email: string | null; fr_customer_id: string | null };
  const repName = (r.rep as unknown as { full_name: string } | null)?.full_name ?? 'Talent';

  if (b.action === 'view') {
    if (r.status === 'sent' || !r.first_viewed_at)
      await db.from('proposals').update({ status: 'viewed', first_viewed_at: r.first_viewed_at ?? new Date().toISOString() }).eq('id', r.id);
    return json({ signed: false, number: r.number, doc, updated_at: r.updated_at, payment_method: methodOf(r.payment_method, r.financing_plan),
      customer_name: `${cust.first_name ?? ''} ${cust.last_name ?? ''}`.trim(), rep_name: repName, portal_url: await portalUrl(db) });
  }

  // sign
  const method = b.method as Exclude<Payload['payment_method'], ''>;
  if (!(method in METHOD_TEXT)) return json({ error: 'Choose how you would like to pay.' }, 400);
  if (!b.agree) return json({ error: 'Please agree to sign electronically.' }, 400);
  const name = (b.name ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 80) return json({ error: 'Type your full name.' }, 400);
  if ((b.signature ?? '').length > 600_000) return json({ error: 'The signature is too large. Clear it and sign again.' }, 400);
  if (b.updated_at !== r.updated_at) return json({ error: 'This proposal was just updated. Reload the page to see the latest version, then sign.', reload: true }, 409);
  let sig: Uint8Array;
  try { sig = pngBytes(b.signature ?? ''); } catch { return json({ error: 'Please sign in the box.' }, 400); }

  // Claim it first so two taps (or the rep signing at the same time) can never make two signed copies.
  const signedAt = new Date().toISOString();
  const fin = method === 'finance_sac' ? 'regions_9mo_sac' : method === 'finance_5yr' ? 'regions_5yr' : null;
  const { data: claimed } = await db.from('proposals').update({ status: 'signed', signed_at: signedAt, sign_token_hash: null, signed_via: 'email_link' })
    .eq('id', r.id).in('status', ['sent', 'viewed']).eq('updated_at', r.updated_at).select('id');
  if (!claimed?.length) return json({ error: 'This proposal was just updated or signed. Reload the page.', reload: true }, 409);
  try {
    const signedDoc = withPayment(doc, method);
    const names = { customer: name, rep: repName };
    const pdf = await renderPdf(signedDoc, r.number, { customer: sig, rep: null }, names, signedAt);
    const hash = await sha256(pdf), dir = `${r.number}`, up = store(db);
    await up(`${dir}/signed.pdf`, pdf, 'application/pdf');
    await up(`${dir}/sig-customer.png`, sig, 'image/png');
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
    await db.from('signatures').insert({ proposal_id: r.id, signer_role: 'customer', signer_name: name, signature_image_path: `${dir}/sig-customer.png`,
      signed_at: signedAt, ip_address: ip, user_agent: req.headers.get('user-agent'), document_sha256: hash, signed_pdf_path: `${dir}/signed.pdf` }).throwOnError();
    await db.from('proposals').update({ signed_pdf_path: `${dir}/signed.pdf`, signed_pdf_sha256: hash, doc: signedDoc,
      payment_method: fin ? 'financing' : method, financing_plan: fin, updated_at: signedAt }).eq('id', r.id).throwOnError();
    const { data: lines } = await db.from('proposal_lines').select('price_item_id, name, qty').eq('proposal_id', r.id) as unknown as { data: Record<string, unknown>[] | null };
    const p: SoldInfo = { payment_method: method, doc: signedDoc, quote: { total: Number(r.total), down_amount: Number(r.down_payment_amount ?? 0) } };
    const done = await finishSigned(db, { id: r.id, number: r.number, pdf, frCustomerId: cust.fr_customer_id, email: cust.email, firstName: cust.first_name ?? '', names, p, lines: lines ?? [] });
    // Tell the rep and the office it was signed online.
    try {
      const { data: u } = await db.auth.admin.getUserById(r.rep_id);
      const to = [...new Set([u?.user?.email, Deno.env.get('MAIL_FROM')].filter((x): x is string => !!x))];
      if (to.length) await sendEmail({ to, fromName: 'Talent Proposals', subject: `SIGNED online - proposal #${r.number} (${names.customer})`,
        html: `<p>${esc(names.customer)} signed proposal #${r.number} online. Payment: ${esc(METHOD_TEXT[method])}.</p><p>The signed PDF is attached and is in FieldRoutes.</p>`,
        attachments: [{ filename: `proposal-${r.number}-signed.pdf`, content: b64(pdf) }] });
    } catch (e) { console.error('notify rep', (e as Error).message); }
    return json({ signed: true, number: r.number, emailed: done.emailed, card: method === 'card', portal_url: method === 'card' ? await portalUrl(db) : null, account: method === 'card' ? cust.fr_customer_id : null, brand: doc.brand, phone });
  } catch (e) {
    // Put it back so the customer can try again.
    await db.from('proposals').update({ status: 'viewed', signed_at: null, sign_token_hash: await tokenHash(b.token!), signed_via: null }).eq('id', r.id);
    console.error('customer sign', (e as Error).message);
    return json({ error: 'Something went wrong saving your signature. Please try again, or call us.' }, 500);
  }
}

// ---------- handler ----------
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(url, service, { auth: { persistSession: false } });

  let p: Payload;
  try { p = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const pub = p as unknown as PublicReq;
  if (pub.action === 'view' || pub.action === 'sign') return customerLink(db, req, pub);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'Sign in again to send this proposal.' }, 401);
  const { data: rep } = await db.from('profiles').select('id, full_name, active').eq('id', u.user.id).maybeSingle();
  if (!rep?.active) return json({ error: 'Your login is not set up as a Talent user yet. Ask Nathan or John.' }, 403);

  if (!/^[0-9a-f-]{36}$/i.test(p.client_ref ?? '')) return json({ error: 'Missing client_ref' }, 400);
  if (!p.lines?.length) return json({ error: 'The proposal has no work on it.' }, 400);
  if (p.quote.discount_pct > 10) return json({ error: 'Discount is over 10%.' }, 400);

  const signing = !!(p.signatures?.customer && p.signatures?.rep && p.signed_at);

  // Same client_ref again: a signed proposal is final; an unsigned one is updated in place.
  const { data: existing } = await db.from('proposals').select('id, number, status, customer_emailed_at').eq('client_ref', p.client_ref).maybeSingle();
  if (existing?.status === 'signed')
    return json({ proposal_id: existing.id, number: existing.number, status: 'signed', emailed: !!existing.customer_emailed_at });

  try {
    const sigs = signing ? { customer: pngBytes(p.signatures!.customer), rep: pngBytes(p.signatures!.rep) } : null;
    const c = p.customer;

    // Customer: match on the FieldRoutes id when we have one
    const cust = {
      fr_customer_id: c.fr_customer_id || null, first_name: c.first_name, last_name: c.last_name, company: c.company || null,
      phone: c.phone || null, email: c.email || null, address: c.address, city: c.city || null, state: c.state || 'VA', zip: c.zip || null,
      updated_at: new Date().toISOString(),
    };
    let customerId: string;
    const found = cust.fr_customer_id
      ? (await db.from('customers').select('id').eq('fr_customer_id', cust.fr_customer_id).maybeSingle()).data : null;
    if (found) { customerId = found.id; await db.from('customers').update(cust).eq('id', customerId).throwOnError(); }
    else customerId = (await db.from('customers').insert({ ...cust, created_by: rep.id }).select('id').single().throwOnError()).data!.id;

    const fin = p.payment_method === 'finance_sac' ? 'regions_9mo_sac' : p.payment_method === 'finance_5yr' ? 'regions_5yr' : null;
    const now = new Date().toISOString();
    const row = {
      client_ref: p.client_ref, customer_id: customerId, brand: p.brand, status: signing ? 'signed' : 'sent',
      subtotal: p.quote.subtotal, discount_pct: p.quote.discount_pct, discount_amount: p.quote.discount_amount, total: p.quote.total,
      discount_approval: APPROVAL[p.quote.discount_status] ?? 'none', discount_approver_name: p.quote.approver,
      payment_method: fin ? 'financing' : (p.payment_method || null), financing_plan: fin,
      down_payment_amount: p.quote.down_amount, down_payment_pct: p.quote.down_pct,
      price_book_version: p.price_book.loaded_at, price_book_source: p.price_book.source,
      top_down_ack: p.top_down_ack, doc: p.doc, app_draft: p.app_draft ?? null, signed_at: signing ? p.signed_at : null, updated_at: now,
      ...(signing ? { sign_token_hash: null, signed_via: 'in_person' } : {}),
    };
    let id: string, number: number;
    if (existing) {
      id = existing.id; number = existing.number;
      await db.from('proposals').update(row).eq('id', id).throwOnError();
      for (const t of ['proposal_lines', 'drawings', 'inspection_answers', 'inspection_header'])
        await db.from(t).delete().eq('proposal_id', id).throwOnError();
    } else {
      const { data: prop } = await db.from('proposals').insert({ ...row, rep_id: rep.id, sent_at: now }).select('id, number').single().throwOnError();
      id = prop!.id; number = prop!.number;
    }

    await db.from('proposal_lines').insert(p.lines.map(l => ({ ...l, proposal_id: id }))).throwOnError();
    if (p.drawings.length) await db.from('drawings').insert(p.drawings.map(d => ({ ...d, proposal_id: id }))).throwOnError();
    if (p.answers.length) await db.from('inspection_answers').insert(p.answers.map(a => ({ ...a, proposal_id: id }))).throwOnError();
    await db.from('inspection_header').insert({ proposal_id: id, technician_id: rep.id, inspected_on: now.slice(0, 10), comments: p.comments || null }).throwOnError();

    // PDF
    const names = { customer: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(), rep: rep.full_name };
    const pdf = await renderPdf(p.doc, number, sigs, names, signing ? p.signed_at : null);
    const hash = await sha256(pdf);
    const dir = `${number}`;
    const up = store(db);

    if (!sigs) {
      await up(`${dir}/unsigned.pdf`, pdf, 'application/pdf');
      await db.from('proposals').update({ unsigned_pdf_path: `${dir}/unsigned.pdf` }).eq('id', id).throwOnError();
      const fr = await writeBack(db, id, number, cust.fr_customer_id, pdf, false, p, names.rep);
      const sign = p.email_to_sign ? await emailToSign(db, id, number, c.email, c.first_name ?? '', p.doc, pdf, names.rep) : undefined;
      return json({ proposal_id: id, number, status: 'sent', emailed: false, fr, sign_emailed: sign?.emailed ?? false, sign_note: sign?.note });
    }

    await up(`${dir}/signed.pdf`, pdf, 'application/pdf');
    await up(`${dir}/sig-customer.png`, sigs.customer, 'image/png');
    await up(`${dir}/sig-rep.png`, sigs.rep, 'image/png');

    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
    const ua = req.headers.get('user-agent');
    await db.from('signatures').insert([
      { proposal_id: id, signer_role: 'customer', signer_name: names.customer, signature_image_path: `${dir}/sig-customer.png`, signed_at: p.signed_at, ip_address: ip, user_agent: ua, document_sha256: hash, signed_pdf_path: `${dir}/signed.pdf` },
      { proposal_id: id, signer_role: 'rep', signer_name: names.rep, signature_image_path: `${dir}/sig-rep.png`, signed_at: p.signed_at, ip_address: ip, user_agent: ua, document_sha256: hash, signed_pdf_path: `${dir}/signed.pdf` },
    ]).throwOnError();
    await db.from('proposals').update({ signed_pdf_path: `${dir}/signed.pdf`, signed_pdf_sha256: hash }).eq('id', id).throwOnError();

    const done = await finishSigned(db, { id, number, pdf, frCustomerId: cust.fr_customer_id, email: c.email, firstName: c.first_name ?? '', names, p, lines: p.lines });
    return json({ proposal_id: id, number, status: 'signed', ...done });
  } catch (e) {
    const msg = (e as { message?: string }).message ?? String(e);
    console.error('submit-proposal', msg);
    return json({ error: `Could not save: ${msg.slice(0, 300)}` }, 500);
  }
});
