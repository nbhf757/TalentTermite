// Searches FieldRoutes customers for the rep's customer screen. The FieldRoutes keys live only here
// (Supabase secrets FR_SUBDOMAIN, FR_AUTH_KEY, FR_AUTH_TOKEN), never in the app.
// Requires a signed-in user (verify_jwt). Read-only.
// Request: POST { q: string }  (last name, phone, or street address; 3+ characters)
// Response: { customers: [{ fr_customer_id, first_name, last_name, company, phone, email, address, city, state, zip }] }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type FrCustomer = Record<string, string | null | undefined>;

async function frSearch(base: string, auth: Record<string, string>, filter: Record<string, string>) {
  const body = new URLSearchParams({ ...auth, ...filter, includeData: '1' });
  const r = await fetch(`${base}/customer/search`, { method: 'POST', body });
  const text = await r.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(text); } catch { throw new Error(`FieldRoutes ${r.status}: ${text.slice(0, 300)}`); }
  if (!r.ok) throw new Error(`FieldRoutes ${r.status}: ${String(data.errorMessage ?? text).slice(0, 300)}`);
  if (data.success === false) throw new Error(String(data.errorMessage ?? 'FieldRoutes error'));
  return (data.customers ?? []) as FrCustomer[];
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sub = Deno.env.get('FR_SUBDOMAIN'), key = Deno.env.get('FR_AUTH_KEY'), token = Deno.env.get('FR_AUTH_TOKEN');
  if (!sub || !key || !token) return json({ error: 'FieldRoutes is not connected yet' }, 503);

  let q = '', diag = false;
  try { const b = await req.json(); q = String(b.q ?? '').trim(); diag = b.diag === true; } catch { /* empty body */ }
  if (diag) {
    // Temporary connection check: reports only shapes and status codes, never the secret values.
    const host = sub.replace(/^https?:\/\//, '').replace(/\.fieldroutes\.com.*$/, '').replace(/\/.*$/, '');
    const out: Record<string, unknown> = {
      sub_len: sub.length, sub_has_scheme: /^https?:/.test(sub), sub_has_domain: sub.includes('fieldroutes'),
      sub_dots: (sub.match(/\./g) ?? []).length, sub_has_pestroutes: sub.includes('pestroutes'), sub_has_slash: sub.includes('/'), sub_upper: /[A-Z]/.test(sub),
      sub_has_space: /\s/.test(sub) || /\s/.test(key) || /\s/.test(token), key_len: key.length, token_len: token.length,
    };
    const tries: [string, string, RequestInit][] = [
      ['post_search', `https://${host}.fieldroutes.com/api/customer/search`, { method: 'POST', body: new URLSearchParams({ authenticationKey: key.trim(), authenticationToken: token.trim(), lname: 'Smith' }) }],
      ['get_search', `https://${host}.fieldroutes.com/api/customer/search?` + new URLSearchParams({ authenticationKey: key.trim(), authenticationToken: token.trim(), lname: 'Smith' }), { method: 'GET' }],
      ['get_office', `https://${host}.fieldroutes.com/api/office/search?` + new URLSearchParams({ authenticationKey: key.trim(), authenticationToken: token.trim() }), { method: 'GET' }],
      ['pr_office', `https://${host.replace(/\.pestroutes\.com.*$/, '')}.pestroutes.com/api/office/search?` + new URLSearchParams({ authenticationKey: key.trim(), authenticationToken: token.trim() }), { method: 'GET' }],
      ['lower_office', `https://${host.toLowerCase()}.fieldroutes.com/api/office/search?` + new URLSearchParams({ authenticationKey: key.trim(), authenticationToken: token.trim() }), { method: 'GET' }],
    ];
    for (const [name, url, init] of tries) {
      try {
        const r = await fetch(url, init); const t = await r.text(); let j: Record<string, unknown> | null = null; try { j = JSON.parse(t); } catch { /* */ }
        out[name] = { status: r.status, success: j?.success, err: j?.errorMessage, keys: j ? Object.keys(j).slice(0, 8) : null, n: Array.isArray(j?.customerIDs) ? (j!.customerIDs as unknown[]).length : undefined, raw: j ? undefined : t.slice(0, 120) };
      } catch (e) { out[name] = { fetch_error: (e as Error).message }; }
    }
    return json(out);
  }
  if (q.length < 3) return json({ error: 'Type at least 3 characters' }, 400);

  const base = `https://${sub}.fieldroutes.com/api`;
  const auth = { authenticationKey: key, authenticationToken: token };
  const digits = q.replace(/\D/g, '');
  const filter = digits.length >= 7 && digits.length === q.replace(/[\s()+.-]/g, '').length
    ? { phone: digits }
    : /^\d+\s/.test(q) ? { address: q } : { lname: q };

  try {
    const rows = (await frSearch(base, auth, filter)).slice(0, 25);
    return json({
      customers: rows.map(c => ({
        fr_customer_id: String(c.customerID ?? ''),
        first_name: c.fname ?? '', last_name: c.lname ?? '', company: c.companyName ?? '',
        phone: c.phone1 ?? '', email: c.email ?? '',
        address: c.address ?? '', city: c.city ?? '', state: c.state ?? '', zip: c.zip ?? '',
      })),
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
