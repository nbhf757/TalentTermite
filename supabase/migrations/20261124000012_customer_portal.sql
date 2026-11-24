-- Nathan 2026-11-24: the FieldRoutes customer portal is on. Card customers are sent there to enter their card
-- (Talent never sees card numbers). Set value.url to the portal sign-in link once known.
insert into app_settings (key, value) values ('customer_portal', '{"url": null}') on conflict (key) do nothing;
