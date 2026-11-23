-- Price book: recurring services (initial + recurring charge) and rep-facing notes
alter table price_items
  add column initial_price numeric(10,2),
  add column recurring_price numeric(10,2),
  add column recurring_interval text check (recurring_interval in ('month','quarter','year','service')),
  add column rep_notes text,
  add column source text not null default 'pricing_sheet_2025-09-17';

alter table price_items drop constraint price_items_section_check;
alter table price_items add constraint price_items_section_check
  check (section in ('foundation','moisture','pest','attic','recurring'));
