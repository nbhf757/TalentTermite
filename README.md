# Talent Quote

Inspection and proposal app for Talent Pest Control and Talent Foundation Solutions.

Stack: Supabase (database, auth, storage, edge functions) + Netlify (hosting).

## Layout
- `supabase/migrations/` — database schema (row level security on every table; card numbers are never stored)
- `config/inspection_27_point.json` — the 27-point inspection as app questions
- `config/suggestion_rules_DRAFT.csv` — inspection answer → suggested work (draft, pending review)

## Business rules
- Discounts: up to 5% rep decides; over 5% flags manager; 10% max, needs John, Ian or Nathan.
- Jobs over $4,000 require 25% down. Financing: EnerBank (Regions) 9 months same as cash or 5-year.
- Warranty: 1-year workmanship on all jobs; Aprilaire 5-year on dehumidifiers.
- On signing: upload signed PDF + BOM to the customer in FieldRoutes, alert Lindsey, Jenna and Brittany, email BOM to the office.
