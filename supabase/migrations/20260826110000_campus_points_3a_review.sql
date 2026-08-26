-- Phase 3A: review adjustments to 20260826100000_campus_points.sql.
--
-- Per repo convention (see 20260825091000_restrict_otp_function_execute.sql),
-- an already-applied migration is superseded rather than rewritten. This
-- file makes the two changes requested in the 3A architecture review, plus
-- the real (sourced, not invented) coordinate seed for the subset of points
-- that could actually be verified.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

-- ============ 1. compute_order_distance: drop SECURITY DEFINER ============
-- Review finding: distance between two campus_points rows is not a
-- privileged operation the way OTP read/verify is - both rows are already
-- visible to any authenticated caller via campus_points_select_active (RLS
-- `using (active)`). SECURITY DEFINER exists to let a function see data the
-- CALLER can't; here the caller already can, so running as invoker is
-- strictly less-privileged and behaves identically. Re-created without
-- `security definer` (defaults to invoker).
--
-- Also applying the OTP-function lesson up front instead of discovering it
-- again later: `revoke all ... from public` does NOT remove `anon`'s own
-- direct EXECUTE grant, because Supabase grants EXECUTE on new `public`
-- schema functions to anon/authenticated/service_role via ALTER DEFAULT
-- PRIVILEGES at project creation - a revoke scoped to PUBLIC never touches
-- that. Revoking from `anon` explicitly, not just `public`, from the start.
create or replace function public.compute_order_distance(p_pickup_id uuid, p_delivery_id uuid)
returns double precision
language plpgsql
set search_path = public
as $$
declare
  v_pickup campus_points%rowtype;
  v_delivery campus_points%rowtype;
begin
  select * into v_pickup from campus_points where id = p_pickup_id and active;
  if not found then
    raise exception 'Unknown or inactive pickup point';
  end if;

  select * into v_delivery from campus_points where id = p_delivery_id and active;
  if not found then
    raise exception 'Unknown or inactive delivery point';
  end if;

  return haversine_km(v_pickup.lat, v_pickup.lng, v_delivery.lat, v_delivery.lng);
end;
$$;

revoke all on function public.compute_order_distance(uuid, uuid) from public;
revoke execute on function public.compute_order_distance(uuid, uuid) from anon;
grant execute on function public.compute_order_distance(uuid, uuid) to authenticated;

-- ============ 2. orders.pickup_point_id ============
-- Review finding: restaurant_name works as today's pickup identifier only
-- because the set is tiny, but it's a string match, not a stable key - the
-- exact fragility delivery_point_id was already added to avoid on the
-- delivery side. Adding the analogous column rather than defending an
-- inconsistency: keeping pickup resolved by name-string while delivery is
-- resolved by id would mean two different resolution mechanisms for what
-- is structurally the same problem, and compute_order_distance already
-- requires two point ids either way. restaurant_name remains the display
-- column, unchanged - this is purely an internal resolution aid, same role
-- delivery_point_id already plays.
do $$
begin
  alter table orders add column pickup_point_id uuid references campus_points(id);
exception
  when duplicate_column then null;
end $$;

-- ============ 3. Real coordinate seed (sourced, not invented) ============
-- Source: OpenStreetMap, via the Overpass API, queried live against the
-- "Vellore Institute of Technology" area on 2026-08-26 - a public,
-- reproducible, third-party source, not a guess. Query used:
--   [out:json];area["name"~"Vellore Institute of Technology"]->.a;
--   (node["name"](area.a);way["name"](area.a););out center;
--
-- Only hostel blocks with an exact letter-name match in that result are
-- seeded here. NOT found in that source (left inactive/null, unchanged
-- from 20260826100000): hostel blocks A, C, I, K, L, M, O, Q, R; all 3
-- restaurants (One Food, DC Cafe, Campus Store); all 8 campus landmarks
-- (TT/SJT/MB/PRP/GDN/Central Library/SMV/Academic Block) - a follow-up,
-- targeted Overpass query for those specific names returned no match, and
-- inventing coordinates for them would recreate exactly the fabricated-
-- distance_km problem 3A exists to fix, just moved into seed data.
update campus_points set lat = 12.9745, lng = 79.1575, active = true where key = 'hostel-block-b';
update campus_points set lat = 12.9729, lng = 79.1588, active = true where key = 'hostel-block-d';
update campus_points set lat = 12.9729, lng = 79.1597, active = true where key = 'hostel-block-e';
update campus_points set lat = 12.9740, lng = 79.1583, active = true where key = 'hostel-block-f';
update campus_points set lat = 12.9733, lng = 79.1598, active = true where key = 'hostel-block-g';
update campus_points set lat = 12.9724, lng = 79.1574, active = true where key = 'hostel-block-h';
update campus_points set lat = 12.9723, lng = 79.1582, active = true where key = 'hostel-block-j';
update campus_points set lat = 12.9679, lng = 79.1582, active = true where key = 'hostel-block-n';
update campus_points set lat = 12.9739, lng = 79.1643, active = true where key = 'hostel-block-p';
update campus_points set lat = 12.9742, lng = 79.1657, active = true where key = 'hostel-block-s';
update campus_points set lat = 12.9748, lng = 79.1658, active = true where key = 'hostel-block-t';

-- ============ VERIFY AFTER APPLYING ============
-- select p.proname,
--        has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
--        p.prosecdef as security_definer
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname = 'compute_order_distance';
-- Expect: anon_exec = false, auth_exec = true, security_definer = false.
--
-- select count(*) filter (where active) as active_points, count(*) as total from campus_points;
-- Expect: active_points = 11, total = 31.
