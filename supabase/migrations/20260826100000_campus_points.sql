-- Phase 3A: campus_points reference table + server-computed order distance.
--
-- CONTEXT: orders.distance_km has existed since the baseline schema but was
-- never trustworthy - src/pages/PostRequest.tsx populated it with
-- `Math.random() * 2 + 0.5` on the client and then displayed that fake
-- number back to the requester as if it were real ("0.8 km · similar runs
-- go for around ₹16"). See PHASE3_3A_ARCHITECTURE_PROPOSAL.md for the full
-- design rationale. This migration replaces the fabrication with a real,
-- server-computed value over a small reference table of named campus
-- points - not an external routing API (see the proposal's §4/§8 for why
-- that's unnecessary here).
--
-- IMPORTANT - COORDINATES ARE NOT YET SEEDED. Only the point names/kinds
-- are seeded below, taken verbatim from the app's own existing hardcoded
-- lists (RESTAURANTS/HOSTEL_BLOCKS/CAMPUS_LOCATIONS in PostRequest.tsx),
-- which are known-accurate. Real lat/lng for each point on the actual VIT
-- Vellore campus were NOT available from a verifiable source at the time
-- of writing this migration, and inventing plausible-looking coordinates
-- would just move the "fabricated distance_km" problem into seed data
-- instead of fixing it. lat/lng are nullable for exactly this reason: a
-- point with no coordinates yet simply isn't distance-computable, and
-- compute_order_distance() raises a clear, loud error rather than
-- returning a silently-wrong number. Filling in real coordinates is a
-- required follow-up before this feature can replace the client-side
-- random distance in the UI.
--
-- STATUS: prepared in the repo, NOT verified applied to any live Supabase
-- project by this change. Per Phase 3 Master Plan §7/§15, this must be
-- applied to the STAGING project (wemjskpbulebxgyhyhmk) only, never
-- production (kjsseqlmnmiuqepfmldh).

-- ============ TABLE ============
create table if not exists campus_points (
  id uuid not null default gen_random_uuid(),
  key text not null,
  label text not null,
  kind text not null,
  lat double precision,
  lng double precision,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint campus_points_pkey primary key (id),
  constraint campus_points_key_key unique (key),
  constraint campus_points_kind_check check (kind in ('restaurant', 'hostel_block', 'campus_landmark')),
  -- A point can only be considered active (selectable/usable for distance)
  -- once it actually has coordinates - see the note above.
  constraint campus_points_active_requires_coords check (not active or (lat is not null and lng is not null))
);

create index if not exists campus_points_kind_idx on campus_points(kind);

-- ============ RLS ============
-- Read-only reference data, same trust level as the restaurant/hostel list
-- already hardcoded client-side today (PostRequest.tsx) - just now backed
-- by a real table so distance can be computed server-side. No admin UI
-- exists anywhere in this app, so rows are managed via migration only;
-- deliberately no insert/update/delete policy for any role.
alter table campus_points enable row level security;

drop policy if exists "campus_points_select_active" on campus_points;
create policy "campus_points_select_active"
  on campus_points for select
  using (active);

-- ============ ORDERS: delivery_point_id ============
-- Additive, nullable - existing rows and every current read path over
-- orders.delivery_location (the jsonb symbolic label) are unaffected.
-- Storing the id actually used at order-creation time (rather than
-- re-resolving delivery_location's label later) protects historical
-- orders from silently changing distance if a point is ever corrected.
do $$
begin
  alter table orders add column delivery_point_id uuid references campus_points(id);
exception
  when duplicate_column then null;
end $$;

-- ============ DISTANCE CALCULATION ============
-- Haversine great-circle distance in kilometers between two campus_points.
-- Not routing/walking-path distance - see the architecture proposal for
-- why straight-line is an acceptable v1 over this small, compact campus.
create or replace function public.haversine_km(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
) returns double precision
language sql
immutable
as $$
  select 2 * 6371 * asin(sqrt(
    sin(radians(p_lat2 - p_lat1) / 2) ^ 2
    + cos(radians(p_lat1)) * cos(radians(p_lat2))
      * sin(radians(p_lng2 - p_lng1) / 2) ^ 2
  ));
$$;

-- SECURITY DEFINER, following the same pattern as get_my_order_otp() /
-- verify_delivery_otp() (20260824120300_otp_verification.sql): the client
-- never computes or supplies distance itself, only the two point ids.
create or replace function public.compute_order_distance(p_pickup_id uuid, p_delivery_id uuid)
returns double precision
language plpgsql
security definer
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
grant execute on function public.compute_order_distance(uuid, uuid) to authenticated;

-- ============ SEED: point names/kinds only (see note above re: coordinates) ============
insert into campus_points (key, label, kind, lat, lng, active) values
  ('one-food', 'One Food', 'restaurant', null, null, false),
  ('dc-cafe', 'DC Cafe', 'restaurant', null, null, false),
  ('campus-store', 'Campus Store', 'restaurant', null, null, false),
  ('hostel-block-a', 'Block A', 'hostel_block', null, null, false),
  ('hostel-block-b', 'Block B', 'hostel_block', null, null, false),
  ('hostel-block-c', 'Block C', 'hostel_block', null, null, false),
  ('hostel-block-d', 'Block D', 'hostel_block', null, null, false),
  ('hostel-block-e', 'Block E', 'hostel_block', null, null, false),
  ('hostel-block-f', 'Block F', 'hostel_block', null, null, false),
  ('hostel-block-g', 'Block G', 'hostel_block', null, null, false),
  ('hostel-block-h', 'Block H', 'hostel_block', null, null, false),
  ('hostel-block-i', 'Block I', 'hostel_block', null, null, false),
  ('hostel-block-j', 'Block J', 'hostel_block', null, null, false),
  ('hostel-block-k', 'Block K', 'hostel_block', null, null, false),
  ('hostel-block-l', 'Block L', 'hostel_block', null, null, false),
  ('hostel-block-m', 'Block M', 'hostel_block', null, null, false),
  ('hostel-block-n', 'Block N', 'hostel_block', null, null, false),
  ('hostel-block-o', 'Block O', 'hostel_block', null, null, false),
  ('hostel-block-p', 'Block P', 'hostel_block', null, null, false),
  ('hostel-block-q', 'Block Q', 'hostel_block', null, null, false),
  ('hostel-block-r', 'Block R', 'hostel_block', null, null, false),
  ('hostel-block-s', 'Block S', 'hostel_block', null, null, false),
  ('hostel-block-t', 'Block T', 'hostel_block', null, null, false),
  ('tt-block', 'TT Block', 'campus_landmark', null, null, false),
  ('sjt-block', 'SJT Block', 'campus_landmark', null, null, false),
  ('mb', 'MB', 'campus_landmark', null, null, false),
  ('prp', 'PRP', 'campus_landmark', null, null, false),
  ('gdn', 'GDN', 'campus_landmark', null, null, false),
  ('central-library', 'Central Library', 'campus_landmark', null, null, false),
  ('smv', 'SMV', 'campus_landmark', null, null, false),
  ('academic-block', 'Academic Block', 'campus_landmark', null, null, false)
on conflict (key) do nothing;
