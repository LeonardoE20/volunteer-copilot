-- Advisor tap-to-confirm service hours.
-- The advisor gets a separate secret link (stored only as a hash). It can see students' names,
-- roles and hours for attended slots, never contact details, and can only confirm those rows.
alter table public.events add column if not exists advisor_token_hash text
  check (advisor_token_hash is null or length(advisor_token_hash) = 64);
alter table public.signups add column if not exists hours_confirmed_by text
  check (hours_confirmed_by is null or length(hours_confirmed_by) between 2 and 60);
alter table public.signups add column if not exists hours_confirmed_at timestamptz;
