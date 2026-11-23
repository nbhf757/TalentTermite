-- Exterior perimeter vs crawl space (Nathan, 2026-11-23): an attached garage, porch or stoop the rep checks
-- counts toward the exterior perimeter (termite treatment, outside drains) but not the crawl space measurements.
alter table public.price_items drop constraint price_items_qty_source_check;
alter table public.price_items add constraint price_items_qty_source_check
  check (qty_source in ('perimeter_lf', 'exterior_lf', 'interior_sf', 'attic_sf', 'manual'));
update public.price_items set qty_source = 'exterior_lf', updated_at = now()
  where qty_source = 'perimeter_lf' and name in ('Termidor HE Termite Treatment', 'French Drain (outside)');

alter table public.drawings
  add column if not exists counts_exterior boolean not null default false,
  add column if not exists shared_wall_lf numeric(10,2),
  add column if not exists exterior_lf numeric(10,2);
