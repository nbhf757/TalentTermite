-- Talent quote app: initial schema (DRAFT, Phase 0)
-- Applied to the Talent Supabase project once the connector can reach it.
-- Row level security is on for every table; policies at the bottom.

create extension if not exists pgcrypto;

-- People who log in (reps, managers, office, admins)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null check (role in ('rep','manager','office','admin')),
  can_approve_discount_to numeric(5,2) not null default 5.00, -- % a user may approve
  fr_employee_id text,                                         -- FieldRoutes employee id (for alerts)
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Customers, mirrored from FieldRoutes
create table customers (
  id uuid primary key default gen_random_uuid(),
  fr_customer_id text unique,           -- null until created in FieldRoutes
  first_name text, last_name text, company text,
  phone text, email text,
  address text, city text, state text default 'VA', zip text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Price book (loaded from the Sept 2025 pricing sheet)
create table price_items (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('foundation','moisture','pest','attic')),
  name text not null,
  description text,                     -- customer-facing scope text
  unit text not null check (unit in ('each','lf','sf','hour','lump')),
  qty_source text check (qty_source in ('perimeter_lf','interior_sf','attic_sf','manual')),
  waste_factor numeric(5,3) not null default 1.000,
  unit_price numeric(10,2) not null,
  min_price numeric(10,2),
  warranty_text text,                   -- e.g. '1-year workmanship'; Aprilaire 5-year on dehumidifiers
  permit_required boolean not null default false,
  fr_service_type_id text,              -- for later write-back
  active boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

-- Materials and BOM recipes
create table materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null,                   -- roll, ft, each, ton, bag...
  unit_cost numeric(10,2),
  supplier text,
  active boolean not null default true
);

create table price_item_recipe (
  price_item_id uuid references price_items(id) on delete cascade,
  material_id uuid references materials(id),
  qty_per_unit numeric(12,4) not null,  -- material per 1 unit of the price item
  labor_hours_per_unit numeric(10,4) not null default 0,
  primary key (price_item_id, material_id)
);

-- 27-point rules: answer -> suggested price items
create table suggestion_rules (
  id uuid primary key default gen_random_uuid(),
  point_key text not null,              -- matches inspection_27_point.json keys
  condition jsonb not null,             -- e.g. {"eq":"Yes"} or {"gte":20}
  price_item_id uuid references price_items(id),
  note text,
  active boolean not null default true
);

-- Proposals
create table proposals (
  id uuid primary key default gen_random_uuid(),
  number serial unique,
  customer_id uuid not null references customers(id),
  rep_id uuid not null references profiles(id),
  brand text not null check (brand in ('talent_pest','talent_foundation')),
  status text not null default 'draft'
    check (status in ('draft','sent','viewed','signed','lost','void')),
  subtotal numeric(12,2) not null default 0,
  discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 10),
  discount_amount numeric(12,2) not null default 0,
  discount_approval text not null default 'none'
    check (discount_approval in ('none','manager_flag','pending','approved','rejected')),
  discount_approved_by uuid references profiles(id),
  total numeric(12,2) not null default 0,
  est_material_cost numeric(12,2),
  est_labor_hours numeric(10,2),
  payment_method text check (payment_method in ('card','check','cash','ach','financing')),
  financing_plan text check (financing_plan in ('enerbank_9mo_sac','enerbank_5yr')),
  down_payment_amount numeric(12,2),
  down_payment_pct numeric(5,2),        -- jobs over $4,000 default to 25%
  price_book_version timestamptz,       -- prices used, for offline re-check
  public_token text unique default encode(gen_random_bytes(18),'hex'), -- emailed link
  sent_at timestamptz, first_viewed_at timestamptz, signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Footprint drawings (one or more sections per proposal)
create table drawings (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  area_type text not null check (area_type in ('crawlspace','basement','slab','attic','porch','other')),
  label text,
  include_in_totals boolean not null default true,
  walls jsonb not null default '[]',    -- [{len_ft, dir_deg}], drawn wall by wall
  markers jsonb not null default '[]',  -- piers, damage, water, sump, photos
  calc_perimeter_lf numeric(10,2),
  calc_area_sf numeric(10,2),
  override_perimeter_lf numeric(10,2),
  override_area_sf numeric(10,2),
  override_reason text,
  closure_gap_ft numeric(6,2),
  image_path text,                      -- rendered PNG in storage
  updated_at timestamptz not null default now()
);

-- Inspection answers (27 points)
create table inspection_answers (
  proposal_id uuid references proposals(id) on delete cascade,
  point_key text not null,
  answer text,                          -- 'Yes','No','N/A','Good', or a number
  notes text,
  photo_paths text[] not null default '{}',
  primary key (proposal_id, point_key)
);

create table inspection_header (
  proposal_id uuid primary key references proposals(id) on delete cascade,
  technician_id uuid references profiles(id),
  inspected_on date,
  temp_f int,
  rainy boolean,
  comments text
);

-- Lines on the proposal
create table proposal_lines (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  price_item_id uuid references price_items(id),
  section text not null,
  name text not null,
  description text,
  qty numeric(12,2) not null,
  unit text not null,
  unit_price numeric(10,2) not null,
  line_total numeric(12,2) not null,
  suggested_by_rule uuid references suggestion_rules(id),
  option_group text,                    -- e.g. 'Essential' / 'Complete'
  sort_order int not null default 0
);

-- Signatures (audit trail)
create table signatures (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  signer_role text not null check (signer_role in ('customer','rep')),
  signer_name text not null,
  signature_image_path text not null,
  signed_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  document_sha256 text not null,        -- fingerprint of the PDF that was signed
  signed_pdf_path text
);

-- Card on file: NEVER the card number. Only what FieldRoutes Payments returns.
create table payment_refs (
  proposal_id uuid primary key references proposals(id) on delete cascade,
  fr_payment_profile_id text,
  card_brand text,
  card_last4 char(4),
  captured_at timestamptz
);

-- BOM generated on signing
create table bom_lines (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  material_id uuid references materials(id),
  material_name text not null,
  qty numeric(12,2) not null,
  unit text not null,
  est_cost numeric(12,2)
);

-- Every FieldRoutes call the app makes
create table fr_sync_log (
  id bigserial primary key,
  proposal_id uuid references proposals(id),
  action text not null,                 -- customer_create, document_upload, alert_create...
  request jsonb,
  response jsonb,
  ok boolean,
  attempts int not null default 1,
  created_at timestamptz not null default now()
);

-- Row level security
alter table profiles enable row level security;
alter table customers enable row level security;
alter table price_items enable row level security;
alter table materials enable row level security;
alter table price_item_recipe enable row level security;
alter table suggestion_rules enable row level security;
alter table proposals enable row level security;
alter table drawings enable row level security;
alter table inspection_answers enable row level security;
alter table inspection_header enable row level security;
alter table proposal_lines enable row level security;
alter table signatures enable row level security;
alter table payment_refs enable row level security;
alter table bom_lines enable row level security;
alter table fr_sync_log enable row level security;

-- Helper: current user's role
create or replace function my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and active $$;

-- Everyone signed in can read the price book and rules; only admins edit
create policy price_read on price_items for select to authenticated using (true);
create policy price_admin on price_items for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
create policy mat_read on materials for select to authenticated using (true);
create policy mat_admin on materials for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
create policy recipe_read on price_item_recipe for select to authenticated using (true);
create policy recipe_admin on price_item_recipe for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
create policy rules_read on suggestion_rules for select to authenticated using (true);
create policy rules_admin on suggestion_rules for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');

-- Reps see their own proposals; managers, office and admins see all
create policy prop_rw on proposals for all to authenticated
  using (rep_id = auth.uid() or my_role() in ('manager','office','admin'))
  with check (rep_id = auth.uid() or my_role() in ('manager','office','admin'));
create policy cust_rw on customers for all to authenticated using (true) with check (true);
create policy profiles_read on profiles for select to authenticated using (true);

-- Child tables follow their proposal
create policy drw on drawings for all to authenticated
  using (exists (select 1 from proposals p where p.id = proposal_id))
  with check (exists (select 1 from proposals p where p.id = proposal_id));
create policy ans on inspection_answers for all to authenticated
  using (exists (select 1 from proposals p where p.id = proposal_id))
  with check (exists (select 1 from proposals p where p.id = proposal_id));
create policy hdr on inspection_header for all to authenticated
  using (exists (select 1 from proposals p where p.id = proposal_id))
  with check (exists (select 1 from proposals p where p.id = proposal_id));
create policy lines on proposal_lines for all to authenticated
  using (exists (select 1 from proposals p where p.id = proposal_id))
  with check (exists (select 1 from proposals p where p.id = proposal_id));
create policy sig_read on signatures for select to authenticated
  using (exists (select 1 from proposals p where p.id = proposal_id));
create policy pay_read on payment_refs for select to authenticated
  using (exists (select 1 from proposals p where p.id = proposal_id));
create policy bom_read on bom_lines for select to authenticated
  using (exists (select 1 from proposals p where p.id = proposal_id));
create policy sync_read on fr_sync_log for select to authenticated using (my_role() in ('office','admin'));
-- Signatures, payment refs, BOM and sync log are written only by server functions (service role).
