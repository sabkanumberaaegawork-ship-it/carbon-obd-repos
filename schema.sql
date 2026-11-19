-- CarbonOBD database schema.
-- Run this once in the Supabase SQL Editor, then use the app normally.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  plate text not null check (char_length(plate) between 1 and 30),
  fuel_type text not null check (fuel_type in ('petrol', 'diesel')),
  created_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed')),
  source text not null default 'bluetooth'
    check (source in ('bluetooth', 'simulator')),
  fuel_liters numeric(12, 4) not null default 0,
  co2_kg numeric(12, 4) not null default 0,
  distance_km numeric(12, 4) not null default 0,
  g_per_km numeric(12, 2) not null default 0,
  duration_seconds integer not null default 0,
  reliability_warning text,
  created_at timestamptz not null default now()
);

create table if not exists public.readings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  timestamp timestamptz not null default now(),
  maf numeric(10, 3),
  fuel_rate numeric(10, 4),
  speed numeric(10, 2),
  rpm numeric(10, 2),
  created_at timestamptz not null default now()
);

create index if not exists vehicles_user_id_idx on public.vehicles (user_id);
create index if not exists trips_user_id_started_at_idx
  on public.trips (user_id, started_at desc);
create index if not exists trips_vehicle_id_idx on public.trips (vehicle_id);
create index if not exists readings_trip_id_timestamp_idx
  on public.readings (trip_id, timestamp);
create index if not exists readings_user_id_idx on public.readings (user_id);

-- Private helper schema keeps admin checks out of the PostgREST RPC surface.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- SECURITY DEFINER avoids recursive RLS when checking the admin flag.
create or replace function private.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid()) and is_admin = true
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Create profiles for users who signed up before this schema was installed.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do update set email = excluded.email;

-- A reading must belong to the same user who owns its trip.
create or replace function public.enforce_reading_ownership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  trip_owner uuid;
begin
  select user_id into trip_owner from public.trips where id = new.trip_id;

  if trip_owner is null then
    raise exception 'Trip % does not exist', new.trip_id;
  end if;

  if new.user_id is distinct from trip_owner then
    raise exception 'Reading owner does not match trip owner';
  end if;

  return new;
end;
$$;

drop trigger if exists readings_ownership_check on public.readings;
create trigger readings_ownership_check
  before insert or update of trip_id, user_id on public.readings
  for each row execute function public.enforce_reading_ownership();

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.trips enable row level security;
alter table public.readings enable row level security;

-- profiles -----------------------------------------------------------------
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using ((select auth.uid()) = id or private.is_admin());

-- Users may edit their own non-privileged fields; only admins can set is_admin.
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (
    ((select auth.uid()) = id and is_admin = false)
    or private.is_admin()
  )
  with check (
    ((select auth.uid()) = id and is_admin = false)
    or private.is_admin()
  );

-- vehicles -----------------------------------------------------------------
drop policy if exists "vehicles_select" on public.vehicles;
create policy "vehicles_select"
  on public.vehicles for select
  using (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "vehicles_insert" on public.vehicles;
create policy "vehicles_insert"
  on public.vehicles for insert
  with check (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "vehicles_update" on public.vehicles;
create policy "vehicles_update"
  on public.vehicles for update
  using (user_id = (select auth.uid()) or private.is_admin())
  with check (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "vehicles_delete" on public.vehicles;
create policy "vehicles_delete"
  on public.vehicles for delete
  using (user_id = (select auth.uid()) or private.is_admin());

-- trips --------------------------------------------------------------------
drop policy if exists "trips_select" on public.trips;
create policy "trips_select"
  on public.trips for select
  using (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "trips_insert" on public.trips;
create policy "trips_insert"
  on public.trips for insert
  with check (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "trips_update" on public.trips;
create policy "trips_update"
  on public.trips for update
  using (user_id = (select auth.uid()) or private.is_admin())
  with check (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "trips_delete" on public.trips;
create policy "trips_delete"
  on public.trips for delete
  using (user_id = (select auth.uid()) or private.is_admin());

-- readings -----------------------------------------------------------------
drop policy if exists "readings_select" on public.readings;
create policy "readings_select"
  on public.readings for select
  using (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "readings_insert" on public.readings;
create policy "readings_insert"
  on public.readings for insert
  with check (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "readings_update" on public.readings;
create policy "readings_update"
  on public.readings for update
  using (user_id = (select auth.uid()) or private.is_admin())
  with check (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "readings_delete" on public.readings;
create policy "readings_delete"
  on public.readings for delete
  using (user_id = (select auth.uid()) or private.is_admin());

-- Privileges ---------------------------------------------------------------
grant usage on schema public to authenticated, anon;

-- Trigger functions are called by Postgres, not by API clients. is_admin() is
-- needed by RLS policies, so only signed-in users may execute it.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.enforce_reading_ownership() from public, anon, authenticated;
revoke execute on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;
drop function if exists public.is_admin();

revoke all on public.profiles, public.vehicles, public.trips, public.readings from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.vehicles to authenticated;
grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, update, delete on public.readings to authenticated;

-- To make a user an admin, run this in the Supabase SQL Editor:
-- update public.profiles set is_admin = true where email = 'you@example.com';
