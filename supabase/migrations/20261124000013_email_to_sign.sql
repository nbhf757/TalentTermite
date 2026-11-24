-- Nathan 2026-11-24: reps can email a proposal for the customer to think over and sign online.
-- The link carries a random token; only its SHA-256 is stored. One live link per proposal (re-sending replaces it).
alter table proposals add column if not exists sign_token_hash text unique;
alter table proposals add column if not exists sign_expires_at timestamptz;
alter table proposals add column if not exists sign_emailed_at timestamptz;
alter table proposals add column if not exists sign_email_to text;
alter table proposals add column if not exists signed_via text check (signed_via in ('in_person','email_link'));
