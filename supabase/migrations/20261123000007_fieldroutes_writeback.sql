-- FieldRoutes write-back: the proposal PDF goes to the customer's FR documents; signed jobs create FR scheduling tasks.
alter table proposals
  add column fr_document_id text,
  add column fr_task_ids text[] not null default '{}';

-- Small admin-editable settings (who gets the sold-job task, etc.)
create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
create policy settings_read on app_settings for select to authenticated using (my_role() is not null);
create policy settings_admin on app_settings for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');

-- mode: "each" = one task per person; "first" = one task to the first person;
--       "lead_alerts" = task to the first person, alerts to the rest (Nathan 2026-11-23).
-- category 2 = Scheduling (FieldRoutes standard task categories).
insert into app_settings (key, value) values ('sold_task', '{
  "mode": "lead_alerts",
  "category": 2,
  "due_days": 1,
  "people": [
    {"fname": "Lindsey", "lname": "Dye"},
    {"fname": "Jenna", "lname": "Hodge"},
    {"fname": "Brittany", "lname": "McCarter"}
  ],
  "upload_unsigned": true,
  "show_customer_signed": false
}');
