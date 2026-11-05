-- Volunteer Copilot: initial schema.
-- Security model: RLS is ON for every table and there are NO policies for the anon or
-- authenticated roles, so the browser can never read or write the database directly.
-- All access goes through Netlify Functions using the service-role key, which check the
-- coordinator token (stored only as a SHA-256 hash) before returning private data.

create extension if not exists pgcrypto;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]{6,16}$'),
  coordinator_token_hash text not null check (length(coordinator_token_hash) = 64),
  title text not null check (length(title) between 1 and 120),
  event_date text not null default '' check (length(event_date) <= 40),
  location text not null default '' check (length(location) <= 120),
  todos jsonb not null default '[]'::jsonb,
  advisor_name text not null default '' check (length(advisor_name) <= 60),
  advisor_contact text not null default '' check (length(advisor_contact) <= 80),
  contact_preference text not null default 'any' check (contact_preference in ('text','email','any')),
  students_welcome boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  role text not null check (length(role) between 1 and 60),
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text not null check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  needed int not null check (needed between 1 and 50),
  adults_only boolean not null default false,
  position int not null default 0
);
create index on public.shifts(event_id);

create table public.signups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  shift_id uuid not null references public.shifts(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  contact text not null check (length(contact) between 3 and 80),
  is_student boolean not null default false,
  status text not null default 'confirmed' check (status in ('confirmed','dropped','no_show','attended')),
  remove_token_hash text not null check (length(remove_token_hash) = 64),
  created_at timestamptz not null default now()
);
create index on public.signups(event_id);
create index on public.signups(shift_id);

-- The club contact list the coordinator pastes in (per event, so nothing leaks between events).
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  contact text not null check (length(contact) between 3 and 80),
  is_student boolean not null default false,
  past_roles jsonb not null default '[]'::jsonb
);
create index on public.contacts(event_id);

-- Fixed-window rate limiter used by the functions (per IP, per event, and a global AI cap).
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

alter table public.events enable row level security;
alter table public.shifts enable row level security;
alter table public.signups enable row level security;
alter table public.contacts enable row level security;
alter table public.rate_limits enable row level security;

-- Belt and braces: remove default grants from the browser-facing roles.
revoke all on public.events, public.shifts, public.signups, public.contacts, public.rate_limits
  from anon, authenticated;

-- Atomically count a hit and report whether it is within the limit.
create or replace function public.hit_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  c int;
begin
  insert into rate_limits(key, window_start, count) values (p_key, w, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into c;
  delete from rate_limits where window_start < now() - interval '2 days';
  return c <= p_limit;
end;
$$;
revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;

-- Sign up only if the shift still has room (prevents overbooking under concurrent sign-ups).
create or replace function public.claim_slot(
  p_event_id uuid, p_shift_id uuid, p_name text, p_contact text, p_is_student boolean, p_remove_hash text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  filled int;
  new_id uuid;
begin
  select * into s from shifts where id = p_shift_id and event_id = p_event_id for update;
  if not found then raise exception 'shift_not_found'; end if;
  if s.adults_only and p_is_student then raise exception 'adults_only'; end if;
  select count(*) into filled from signups where shift_id = p_shift_id and status in ('confirmed','attended');
  if filled >= s.needed then raise exception 'shift_full'; end if;
  insert into signups(event_id, shift_id, name, contact, is_student, remove_token_hash)
  values (p_event_id, p_shift_id, p_name, p_contact, p_is_student, p_remove_hash)
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.claim_slot(uuid, uuid, text, text, boolean, text) from public, anon, authenticated;
