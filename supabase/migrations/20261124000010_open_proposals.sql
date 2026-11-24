-- Open-proposals list (Nathan/John goal: no proposal open more than a month).
-- app_draft: the rep app's full working state, so an unsigned proposal can be reopened and signed later.
alter table proposals add column if not exists app_draft jsonb;
alter table proposals add column if not exists lost_at timestamptz;
alter table proposals add column if not exists lost_reason text;
create index if not exists proposals_open_idx on proposals (status, sent_at) where status in ('sent', 'viewed');
