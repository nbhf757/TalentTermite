// Saves a proposal from the rep app and renders its PDF. Signed: status 'signed', signatures saved, customer emailed.
// Unsigned (no signatures sent): status 'sent', PDF marked NOT SIGNED. Saving again with the same client_ref
// updates an unsigned proposal (e.g. the customer signs later); a signed proposal is never changed.
// Requires a signed-in user (verify_jwt). Writes with the service role because signatures are server-written only.
// Email: Resend, when the secrets RESEND_API_KEY and EMAIL_FROM are set. Without them the proposal still saves.
// Request: POST the payload from app/src/lib/submit.ts (buildSubmission).
// Response: { proposal_id, number, status, emailed, email_note? }
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1';

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
  comments: string; top_down_ack: boolean; doc: Doc;
  signatures?: { customer: string; rep: string } | null;
};

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

async function renderPdf(doc: Doc, number: number, sigs: { customer: Uint8Array; rep: Uint8Array } | null,
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
      const img = await pdf.embedPng(png); const scale = Math.min(boxW / img.width, boxH / img.height);
      page.drawImage(img, { x, y: top - boxH, width: img.width * scale, height: img.height * scale });
      page.drawLine({ start: { x, y: top - boxH - 4 }, end: { x: x + boxW, y: top - boxH - 4 }, thickness: 0.75, color: muted });
      page.drawText(clean(`${label}: ${name}`), { x, y: top - boxH - 16, size: 9, font: bold, color: ink });
      page.drawText(clean(`Signed ${when}`), { x, y: top - boxH - 28, size: 8.5, font: reg, color: muted });
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

async function emailCustomer(to: string, firstName: string, brand: string, phone: string, number: number, pdf: Uint8Array) {
  const key = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('EMAIL_FROM');
  if (!key || !from) return { ok: false, note: 'Customer email is not set up yet. The office has the signed PDF.' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${brand} <${from}>`, to: [to], reply_to: Deno.env.get('EMAIL_REPLY_TO') || undefined,
      subject: `Your signed ${brand} proposal (#${number})`,
      html: `<p>Hi ${esc(firstName || 'there')},</p><p>Thank you for choosing ${esc(brand)}. Your signed proposal is attached.</p>` +
        `<p>Our office will contact you to schedule. Questions? Call us at ${esc(phone)}.</p><p>${esc(brand)}</p>`,
      attachments: [{ filename: `${brand.replace(/\s+/g, '-')}-proposal-${number}.pdf`, content: b64(pdf) }],
    }),
  });
  const body = await r.text();
  return r.ok ? { ok: true, note: undefined, response: body } : { ok: false, note: `Email failed (${r.status}). The office has the signed PDF.`, response: body.slice(0, 500) };
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
async function writeBack(db: Db, id: string, number: number, frCustomerId: string | null, pdf: Uint8Array, signed: boolean, p: Payload, repName: string) {
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
    const pay = p.payment_method.startsWith('finance') ? 'Regions Bank financing - approval needed before scheduling' : (p.payment_method || 'not chosen');
    const text = `SOLD - schedule proposal #${number} (${p.doc.brand}). Total ${money(p.quote.total)}` +
      (p.quote.down_amount > 0 ? `, ${money(p.quote.down_amount)} down` : '') + `. Payment: ${pay}. Rep: ${repName}. Signed PDF is in Documents.`;
    const t = await frSoldTasks(db, id, frCustomerId, text);
    out.task_ids = t.ids; notes.push(...t.problems);
    if (t.ids.length) await db.from('proposals').update({ fr_task_ids: t.ids }).eq('id', id);
  }
  if (notes.length) out.note = notes.join(' ');
  return out;
}

// ---------- handler ----------
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(url, service, { auth: { persistSession: false } });

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'Sign in again to send this proposal.' }, 401);
  const { data: rep } = await db.from('profiles').select('id, full_name, active').eq('id', u.user.id).maybeSingle();
  if (!rep?.active) return json({ error: 'Your login is not set up as a Talent user yet. Ask Nathan or John.' }, 403);

  let p: Payload;
  try { p = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
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
      top_down_ack: p.top_down_ack, doc: p.doc, signed_at: signing ? p.signed_at : null, updated_at: now,
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
    const up = (path: string, body: Uint8Array, contentType: string) =>
      db.storage.from('proposals').upload(path, body, { contentType, upsert: true }).then(r => { if (r.error) throw r.error; });

    if (!sigs) {
      await up(`${dir}/unsigned.pdf`, pdf, 'application/pdf');
      await db.from('proposals').update({ unsigned_pdf_path: `${dir}/unsigned.pdf` }).eq('id', id).throwOnError();
      const fr = await writeBack(db, id, number, cust.fr_customer_id, pdf, false, p, names.rep);
      return json({ proposal_id: id, number, status: 'sent', emailed: false, fr });
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

    // Customer copy
    let emailed = false, note: string | undefined;
    if (c.email) {
      const e = await emailCustomer(c.email, c.first_name ?? '', p.doc.brand, p.doc.company.phone, number, pdf);
      emailed = e.ok; note = e.note;
      if ('response' in e) await db.from('fr_sync_log').insert({ proposal_id: id, action: 'email_customer', response: { body: e.response }, ok: e.ok });
      if (emailed) await db.from('proposals').update({ customer_emailed_at: new Date().toISOString() }).eq('id', id);
    } else note = 'No customer email on file, so no copy was emailed.';

    const fr = await writeBack(db, id, number, cust.fr_customer_id, pdf, true, p, names.rep);
    return json({ proposal_id: id, number, status: 'signed', emailed, email_note: note, fr });
  } catch (e) {
    const msg = (e as { message?: string }).message ?? String(e);
    console.error('submit-proposal', msg);
    return json({ error: `Could not save: ${msg.slice(0, 300)}` }, 500);
  }
});
