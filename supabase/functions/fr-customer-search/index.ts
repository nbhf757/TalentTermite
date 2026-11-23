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
  if (!r.ok) throw new Error(`FieldRoutes ${r.status}`);
  const data = await r.json();
  if (data.success === false) throw new Error(data.errorMessage ?? 'FieldRoutes error');
  return (data.customers ?? []) as FrCustomer[];
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sub = Deno.env.get('FR_SUBDOMAIN'), key = Deno.env.get('FR_AUTH_KEY'), token = Deno.env.get('FR_AUTH_TOKEN');
  if (!sub || !key || !token) return json({ error: 'FieldRoutes is not connected yet' }, 503);

  let q = '';
  try { q = String((await req.json()).q ?? '').trim(); } catch { /* empty body */ }
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
