// Reads a photo of a City Assessor building sketch (often marked up by the inspector) and returns the
// foundation outline as walls the drawing tool can load. The rep always reviews and can edit the result.
// The Anthropic key lives only here (Supabase secret ANTHROPIC_API_KEY), never in the app.
// Requires a signed-in, active Talent user.
// Request: POST { image: base64 (no data: prefix), media_type: 'image/jpeg' | 'image/png' | 'image/webp' }
// Response: { outline: [{ length_ft, direction }], extras: [{ label, kind, width_ft, depth_ft }],
//             confidence, notes, stated_area_sf, stated_perimeter_lf }

import Anthropic from 'npm:@anthropic-ai/sdk@1.6.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function isTalentUser(req: Request) {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return false;
  const { data } = await db.from('profiles').select('active').eq('id', u.user.id).maybeSingle();
  return !!data?.active;
}

const DIRECTIONS = ['right', 'down', 'left', 'up', 'up-right', 'down-right', 'down-left', 'up-left'];
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['outline', 'extras', 'confidence', 'notes', 'stated_area_sf', 'stated_perimeter_lf'],
  properties: {
    outline: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['length_ft', 'direction'],
        properties: { length_ft: { type: 'number' }, direction: { type: 'string', enum: DIRECTIONS } },
      },
    },
    extras: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['label', 'kind', 'width_ft', 'depth_ft'],
        properties: {
          label: { type: 'string' },
          kind: { type: 'string', enum: ['stoop', 'porch', 'deck', 'garage', 'addition', 'other'] },
          width_ft: { type: 'number' }, depth_ft: { type: 'number' },
        },
      },
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    notes: { type: 'string' },
    stated_area_sf: { type: ['number', 'null'] },
    stated_perimeter_lf: { type: ['number', 'null'] },
  },
};

const PROMPT = `This is a photo or screenshot of a City Assessor building sketch for a house, sometimes marked up by hand by a foundation inspector. Read it and give me the outline of the main house footprint (the foundation) as a list of walls.

How to walk the outline:
- Start at the top-left corner of the main house and walk clockwise, so the first wall goes right along the top edge.
- One wall per labeled length. If one side is labeled in pieces (for example 7 and 22 along one edge), list each piece as its own wall in order.
- Directions are on the page: right, down, left, up, or a diagonal (up-right, down-right, down-left, up-left) only when the edge is clearly drawn at 45 degrees.
- Use the numbers written on the sketch (feet). Only estimate from the drawing when an edge has no number, and say which ones in notes.
- The outline must close: the walls going right must add up to the walls going left, and down must equal up. If the written numbers do not close, keep the written numbers and explain in notes.

What to leave out of the outline:
- Stoops, porches, decks, patios, garages, and carports are not part of the main foundation. Assessor sketches mark these with codes (RSS or SS = stoop, OP/OFP/EP = porch, WD/WDDK = wood deck, PT = patio, GAR = garage, CP = carport), separate boxes, or a different color. List each one in extras with its width and depth, and leave it out of the outline.
- If the inspector's handwriting disagrees with the printed sketch, follow the handwriting and say so in notes.

Also: if the sketch or markup states a total area (sq ft) or perimeter (linear ft) for the house, put those numbers in stated_area_sf and stated_perimeter_lf, otherwise null. Set confidence to low if the image is not a building sketch, is unreadable, or you had to guess more than one length. Keep notes short and plain, written for a field rep.`;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!(await isTalentUser(req))) return json({ error: 'Your login is not set up as a Talent user.' }, 403);
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Sketch reading is not turned on yet (the office needs to add the AI key).' }, 503);

  let image = '', mediaType = 'image/jpeg';
  try { const b = await req.json(); image = String(b.image ?? ''); mediaType = String(b.media_type ?? 'image/jpeg'); } catch { /* empty */ }
  if (!image) return json({ error: 'No picture was sent.' }, 400);
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType)) return json({ error: 'Use a JPG or PNG picture.' }, 400);
  if (image.length > 6_000_000) return json({ error: 'That picture is too large. Try a smaller photo or a screenshot.' }, 413);

  const client = new Anthropic({ apiKey });
  try {
    // deno-lint-ignore no-explicit-any
    const res: any = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: PROMPT },
        ],
      // deno-lint-ignore no-explicit-any
      }] as any,
    // deno-lint-ignore no-explicit-any
    } as any);
    if (res.stop_reason === 'refusal') return json({ error: 'The AI could not read this picture. Draw it by hand instead.' }, 422);
    if (res.stop_reason === 'max_tokens') return json({ error: 'The AI ran out of room reading this sketch. Try a tighter crop.' }, 422);
    // deno-lint-ignore no-explicit-any
    const text = (res.content as any[]).filter(b => b.type === 'text').map(b => b.text).join('');
    const out = JSON.parse(text);
    console.log(JSON.stringify({ event: 'read-sketch', walls: out.outline?.length, confidence: out.confidence, model: res.model, usage: res.usage }));
    return json(out);
  } catch (e) {
    const status = e instanceof Anthropic.RateLimitError ? 429 : 502;
    return json({ error: `Could not read the sketch: ${(e as Error).message.slice(0, 200)}` }, status);
  }
});
