// Builds app/src/data/fallback_prices.json from the price book seed SQL.
// The app ships this file so reps can price offline before the live price book has ever loaded.
// Run after changing the seed:  node scripts/build-fallback-prices.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/seed/price_book_2025-09-17.sql', import.meta.url), 'utf8');
const cols = ['section','name','unit','qty_source','unit_price','min_price','initial_price','recurring_price','recurring_interval','description','rep_notes','sort_order'];

function parseTuple(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    if (s[i] === "'") {
      let v = ''; i++;
      for (;;) { if (s[i] === "'" && s[i + 1] === "'") { v += "'"; i += 2; } else if (s[i] === "'") { i++; break; } else v += s[i++]; }
      out.push(v);
    } else {
      const j = s.indexOf(',', i); const raw = (j < 0 ? s.slice(i) : s.slice(i, j)).trim();
      out.push(raw === 'null' ? null : Number(raw)); i = j < 0 ? s.length : j;
    }
    while (s[i] === ',' || s[i] === ' ') i++;
  }
  return out;
}

const items = sql.split('\n')
  .filter(l => /^\('(attic|foundation|moisture|pest|recurring)'/.test(l))
  .map(l => {
    const vals = parseTuple(l.replace(/^\(/, '').replace(/\)[,;]\s*$/, ''));
    if (vals.length !== cols.length) throw new Error('Bad row: ' + l);
    const o = Object.fromEntries(cols.map((c, k) => [c, vals[k]]));
    return { id: 'fallback:' + o.name, waste_factor: 1, ...o };
  });

const desc = JSON.parse(readFileSync(new URL('../config/price_descriptions.json', import.meta.url), 'utf8')).descriptions;
for (const i of items) if (desc[i.name]) i.description = desc[i.name];

mkdirSync(new URL('../app/src/data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../app/src/data/fallback_prices.json', import.meta.url),
  JSON.stringify({ source: 'pricing_sheet_2025-09-17', items }, null, 1) + '\n');
console.log(items.length, 'items');
