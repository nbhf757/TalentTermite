-- Only active Talent users (a profiles row with a @talenttermite.com email) can read or write anything.
-- A login that exists in Supabase Auth without a profile sees nothing.
alter table profiles add constraint profiles_talent_email check (lower(email) like '%@talenttermite.com');
alter policy price_read on price_items using (my_role() is not null);
alter policy mat_read on materials using (my_role() is not null);
alter policy recipe_read on price_item_recipe using (my_role() is not null);
alter policy rules_read on suggestion_rules using (my_role() is not null);
alter policy cust_rw on customers using (my_role() is not null) with check (my_role() is not null);
alter policy profiles_read on profiles using (my_role() is not null);
alter policy prop_rw on proposals
  using ((rep_id = auth.uid() and my_role() is not null) or my_role() in ('manager','office','admin'))
  with check ((rep_id = auth.uid() and my_role() is not null) or my_role() in ('manager','office','admin'));
