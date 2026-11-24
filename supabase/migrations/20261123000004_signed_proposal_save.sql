-- Saving signed proposals from the rep app (Edge Function submit-proposal, service role).
alter table proposals
  add column client_ref uuid unique,              -- made on the device at signing; makes retries safe
  add column doc jsonb,                           -- the exact text blocks rendered into the PDF
  add column signed_pdf_path text,                -- storage: proposals/<number>/signed.pdf
  add column signed_pdf_sha256 text,
  add column discount_approver_name text,         -- John, Ian or Nathan (10% discounts)
  add column top_down_ack boolean not null default false,
  add column price_book_source text,              -- live / cache / bundled at signing
  add column customer_emailed_at timestamptz;

alter table proposals drop constraint proposals_payment_method_check;
alter table proposals add constraint proposals_payment_method_check
  check (payment_method in ('card','check','cash','check_cash','ach','financing'));

-- Private bucket for signed PDFs and signature images; read through signed URLs only.
insert into storage.buckets (id, name, public) values ('proposals', 'proposals', false)
  on conflict (id) do nothing;
