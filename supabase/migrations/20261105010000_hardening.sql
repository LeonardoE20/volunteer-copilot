-- Hardening after the security review.

create index if not exists rate_limits_window_idx on public.rate_limits(window_start);

-- Normalize a contact the same way the app does: phones by last 10 digits, emails lower-cased.
create or replace function public.norm_contact(c text) returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case when position('@' in c) > 0 then lower(trim(c))
              else right(regexp_replace(c, '\D', '', 'g'), 10) end
$$;
revoke all on function public.norm_contact(text) from public, anon, authenticated;

create or replace function public.hit_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  c int;
begin
  insert into rate_limits(key, window_start, count) values (p_key, w, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into c;
  -- Purge old rows only occasionally (about 1 call in 50) to keep this cheap.
  if random() < 0.02 then
    delete from rate_limits where window_start < now() - interval '2 days';
  end if;
  return c <= p_limit;
end;
$$;
revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;

-- Adds: students only where welcome, no duplicate sign-ups for the same slot,
-- and at most 3 active slots per person per event (limits slot-hogging spam).
create or replace function public.claim_slot(
  p_event_id uuid, p_shift_id uuid, p_name text, p_contact text, p_is_student boolean, p_remove_hash text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  ev record;
  filled int;
  mine int;
  new_id uuid;
begin
  select * into ev from events where id = p_event_id;
  if not found then raise exception 'event_not_found'; end if;
  if p_is_student and not ev.students_welcome then raise exception 'no_students'; end if;
  select * into s from shifts where id = p_shift_id and event_id = p_event_id for update;
  if not found then raise exception 'shift_not_found'; end if;
  if s.adults_only and p_is_student then raise exception 'adults_only'; end if;
  if exists (select 1 from signups where shift_id = p_shift_id and status = 'confirmed'
             and norm_contact(contact) = norm_contact(p_contact)) then
    raise exception 'duplicate';
  end if;
  select count(*) into mine from signups where event_id = p_event_id and status = 'confirmed'
    and norm_contact(contact) = norm_contact(p_contact);
  if mine >= 3 then raise exception 'too_many'; end if;
  select count(*) into filled from signups where shift_id = p_shift_id and status in ('confirmed','attended');
  if filled >= s.needed then raise exception 'shift_full'; end if;
  insert into signups(event_id, shift_id, name, contact, is_student, remove_token_hash)
  values (p_event_id, p_shift_id, p_name, p_contact, p_is_student, p_remove_hash)
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.claim_slot(uuid, uuid, text, text, boolean, text) from public, anon, authenticated;
