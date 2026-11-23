-- Nathan 2026-11-23: vapor barriers are 10 mil (taped or staked) or 45 mil taped. Encapsulation uses 45 mil taped.
-- Financing moved from EnerBank to Regions Bank (codes D4377 9-month same-as-cash, DEL2674 9.99% APR 5-year).
update price_items set name = 'Vapor Barrier (10 mil), staked',
  description = 'Install a 10 mil vapor barrier over the crawl space floor, staked in place, to block ground moisture.'
  where name = 'Vapor Barrier (10 mil)';
update price_items set active = false
  where name in ('Vapor Barrier (12 mil woven)', 'Vapor Barrier (12 mil woven), taped seams',
                 'Vapor Barrier (20 mil)', 'Vapor Barrier (20 mil), taped seams');
-- Price not known yet: added turned off. Set the price and tick Offered in the Prices editor.
insert into price_items (section, name, description, unit, qty_source, waste_factor, unit_price, active, sort_order, rep_notes, source)
select 'moisture', 'Vapor Barrier (45 mil), taped seams',
  'Install a heavy-duty 45 mil vapor barrier over the crawl space floor with all seams taped, to block ground moisture.',
  'sf', 'interior_sf', 1, 0, false, 102, 'Price to be set by the office.', 'nathan_2026-11-23'
where not exists (select 1 from price_items where name = 'Vapor Barrier (45 mil), taped seams');
update price_items set description = 'Complete crawl space encapsulation with a 45 mil vapor barrier sealed to the walls with taped seams, and foam board insulation on the walls.'
  where name = 'Full Encapsulation (with foam board insulation)';
update price_items set description = 'Complete crawl space encapsulation with a 45 mil vapor barrier sealed to the walls with taped seams.'
  where name = 'Full Encapsulation (no foam board insulation)';

-- Regions Bank financing plan names
alter table proposals drop constraint if exists proposals_financing_plan_check;
update proposals set financing_plan = replace(financing_plan, 'enerbank_', 'regions_') where financing_plan like 'enerbank_%';
alter table proposals add constraint proposals_financing_plan_check check (financing_plan in ('regions_9mo_sac', 'regions_5yr'));
