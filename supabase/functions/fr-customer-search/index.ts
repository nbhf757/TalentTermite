// Searches FieldRoutes customers for the rep's customer screen. The FieldRoutes keys live only here
// (Supabase secrets FR_SUBDOMAIN, FR_AUTH_KEY, FR_AUTH_TOKEN), never in the app.
// Requires a signed-in, active Talent user (verify_jwt plus a profiles row). Read-only.
// Request: POST { q: string }  (last name, phone, or street address; 3+ characters)
// Response: { customers: [{ fr_customer_id, first_name, last_name, company, phone, email, address, city, state, zip }] }

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

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


/** True when the caller's login has an active profile (Talent staff). */
async function isTalentUser(req: Request) {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return false;
  const { data } = await db.from('profiles').select('active').eq('id', u.user.id).maybeSingle();
  return !!data?.active;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!(await isTalentUser(req))) return json({ error: 'Your login is not set up as a Talent user.' }, 403);
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
