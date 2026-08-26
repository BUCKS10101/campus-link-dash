-- Phase 3A-2: expand the campus_points catalog into 7 display categories
-- + support a custom (user-dropped) delivery pin distinct from the
-- predefined catalog. See PHASE3_3A_LOCATION_SPEC.md for the full
-- rationale, alias rules, and category list this migration implements.
--
-- Coordinate provenance: every coordinate below is either (a) supplied
-- directly by the project owner (One Food World, Balaji Store, DC Cafe -
-- already seeded/being seeded, see PHASE3_3A_LOCATION_SPEC.md §12), or
-- (b) read from OpenStreetMap's real tag data during this session's
-- inventory pass (same public Overpass source already used for
-- campus_points/campus_path_nodes). Nothing here is invented. Points with
-- no real coordinate found anywhere are seeded name-only, inactive,
-- exactly like the original 3A seed pattern - see §11/§19 of the spec.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

-- ============ 1. WIDEN campus_points.kind ============
-- Original 3-value enum (restaurant/hostel_block/campus_landmark) mapped
-- to the app's now-final 7 display categories. Existing rows are
-- migrated, not duplicated.
alter table campus_points drop constraint if exists campus_points_kind_check;

update campus_points set kind = 'food' where kind = 'restaurant';
update campus_points set kind = 'accommodation' where kind = 'hostel_block';
-- campus_landmark rows split by what they actually are, not left generic.
update campus_points set kind = 'academic' where kind = 'campus_landmark' and key in ('sjt-block', 'mb', 'prp', 'gdn', 'smv', 'academic-block', 'tt-block');
update campus_points set kind = 'landmark' where kind = 'campus_landmark' and key = 'central-library';

alter table campus_points add constraint campus_points_kind_check
  check (kind in ('food', 'shop', 'accommodation', 'academic', 'sports', 'medical', 'landmark'));

-- ============ 2. RENAME/RELABEL existing rows (key stays stable) ============
-- Campus Store -> Balaji Store: app-facing label only. The key
-- ('campus-store') is NOT renamed - existing orders' delivery_point_id
-- still resolves correctly, per PHASE3_3A_LOCATION_SPEC.md §13/§20.
update campus_points set label = 'Balaji Store' where key = 'campus-store';

-- PRP <-> Perl Research Park alias: canonical display stays "PRP" (the
-- project's existing usage); real coordinate from OSM's "Perl Research
-- Park" tag.
update campus_points set lat = 12.9714153, lng = 79.1662525, active = true where key = 'prp';

-- Central Library <-> EV Periyar Library alias: canonical display becomes
-- the real, verifiable name; "central-library" key is preserved so it
-- keeps resolving.
update campus_points set label = 'EV Periyar Library', lat = 12.9693226, lng = 79.1568558, active = true where key = 'central-library';

-- TT Block -> "Technology Tower (TT)": relabeled to match the catalog's
-- naming, but the core TT building itself still has no verified
-- coordinate (only its annexe/courts/subway do - see spec §11), so this
-- stays inactive pending that coordinate.
update campus_points set label = 'Technology Tower (TT)' where key = 'tt-block';

-- DC Cafe: real coordinate supplied directly.
update campus_points set lat = 12.9703649, lng = 79.1596033, active = true where key = 'dc-cafe';

-- ============ 3. NEW CATALOG ROWS ============
insert into campus_points (key, label, kind, lat, lng, active) values
  -- Food
  ('food-court', 'Food Court', 'food', 12.9701061, 79.1590694, true),
  ('street-bites', 'Street Bites', 'food', 12.9748538, 79.1641158, true),
  ('darling-spl-mess', 'Darling SPL Mess', 'food', 12.9735736, 79.1642595, true),
  ('pr-caterers', 'PR Caterers', 'food', 12.9744830, 79.1643071, true),
  ('pr-caterers-special-mess', 'PR Caterers Special Mess', 'food', 12.9742551, 79.1643449, true),
  ('liv-cafeteria', 'Liv Cafeteria', 'food', 12.9707195, 79.1659566, true),
  ('quick-bites', 'Quick Bites', 'food', 12.9729145, 79.1639100, true),
  ('canteen', 'Canteen', 'food', 12.9705339, 79.1544609, true),
  ('lassi-house', 'Lassi House', 'food', 12.9716410, 79.1646292, true),
  ('amul', 'Amul', 'food', 12.9694053, 79.1580766, true),

  -- Shops (Ganga Xerox exists twice in the real data at two genuinely
  -- different locations - both kept rather than guessing which one was
  -- meant; see PHASE3_3A_LOCATION_SPEC.md §11)
  ('all-maart', 'All Maart', 'shop', 12.9700963, 79.1543490, true),
  ('enzo', 'Enzo', 'shop', 12.9724576, 79.1588679, true),
  ('master-xerox-printouts', 'Master Xerox Printouts', 'shop', 12.9679067, 79.1559148, true),
  ('ganga-xerox-main-gate', 'Ganga Xerox (near Main Gate)', 'shop', 12.9700549, 79.1551672, true),
  ('ganga-xerox-p-block', 'Ganga Xerox (near P Block)', 'shop', 12.9720629, 79.1666005, true),

  -- Accommodation
  ('hostel-b-annexe', 'B Annexe', 'accommodation', 12.9749217, 79.1573645, true),
  ('hostel-d-annexe', 'D Annexe', 'accommodation', 12.9733012, 79.1588787, true),
  ('hostel-m-annexe', 'M Annexe', 'accommodation', 12.9727810, 79.1646186, true),
  ('mgb', 'Mahatma Gandhi Block (MGB)', 'accommodation', 12.9720748, 79.1679310, true),

  -- Academic (CDMM/TT Annexe have real coordinates; MB/SJT/GDN/SMV/
  -- Academic Block already exist as unseeded rows from the original 3A
  -- seed and are left untouched here - still pending, see spec §11)
  ('cdmm-building', 'CDMM Building', 'academic', 12.9691713, 79.1549629, true),
  ('tt-annexe', 'TT Annexe', 'academic', 12.9708260, 79.1601971, true),

  -- Sports & Recreation
  ('tt-basketball-court', 'TT Basketball Court', 'sports', 12.9703922, 79.1584572, true),
  ('tt-volleyball-court', 'TT Volleyball Court', 'sports', 12.9700191, 79.1584522, true),
  ('anna-audi-tennis-court', 'Anna Audi Tennis Court', 'sports', 12.9704862, 79.1563891, true),
  ('anna-audi-basketball-court-1', 'Anna Audi Basketball Court 1', 'sports', 12.9699742, 79.1562327, true),
  ('anna-audi-basketball-court-2', 'Anna Audi Basketball Court 2', 'sports', 12.9704405, 79.1559610, true),
  ('anna-audi-volleyball-court', 'Anna Audi Volleyball Court', 'sports', 12.9704744, 79.1556136, true),
  ('mh-basketball-court', 'MH Basketball Court', 'sports', 12.9717550, 79.1574148, true),
  ('mh-tennis-courts', 'MH Tennis Courts', 'sports', 12.9717058, 79.1578109, true),
  ('mh-volleyball-court', 'MH Volleyball Court', 'sports', 12.9717753, 79.1571224, true),
  ('mh-swimming-pool', 'MH Swimming Pool', 'sports', 12.9745002, 79.1608561, true),
  ('vit-womens-indoor-sports-room', 'VIT Women''s Indoor Sports Room', 'sports', 12.9706082, 79.1607048, true),
  ('outdoor-stadium', 'Outdoor Stadium', 'sports', 12.9759705, 79.1600735, true),
  ('running-track', 'Running Track', 'sports', 12.9759284, 79.1607159, true),

  -- Medical & Health
  ('health-centre', 'Health Centre', 'medical', 12.9695037, 79.1546464, true),
  ('saravana-medical', 'Saravana Medical', 'medical', 12.9712642, 79.1608923, true),
  ('saravana-pharmacy', 'Saravana Pharmacy', 'medical', 12.9728395, 79.1583400, true),

  -- Landmarks (Main Gate has no verified coordinate - seeded name-only,
  -- inactive, pending; see spec §11)
  ('main-gate', 'Main Gate', 'landmark', null, null, false),
  ('anna-auditorium', 'Anna Auditorium', 'landmark', 12.9699460, 79.1556745, true),
  ('vit-lake', 'VIT Lake', 'landmark', 12.9695437, 79.1605164, true),
  ('kalpana-chawla-ground', 'Kalpana Chawla Ground', 'landmark', 12.9682435, 79.1569591, true),
  ('chillout-plaza', 'Chillout Plaza', 'landmark', 12.9734802, 79.1646922, true),
  ('tiruvallur-statue', 'Tiruvallur Statue', 'landmark', 12.9718403, 79.1568229, true)
on conflict (key) do nothing;

-- ============ 4. SNAP new/newly-coordinated points into the path graph ============
-- Same nearest-node pattern as the original seed, applied to every point
-- that now has a coordinate but wasn't snapped yet (new rows, plus PRP/
-- Central Library/DC Cafe which just gained real coordinates above).
update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.lat is not null and cp2.nearest_path_node_id is null
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;

-- ============ 5. CUSTOM PIN: additive orders columns ============
-- A custom pin is NOT a campus_points row (per spec §14/§16) - it's a
-- one-off coordinate + note specific to a single order. Nullable,
-- additive; mutually exclusive with delivery_point_id in practice (an
-- order has one or the other), never enforced as a DB constraint since
-- that's a product invariant PostRequest.tsx maintains, not a data
-- integrity rule worth a CHECK. No new RLS policy - these are plain
-- columns on orders, already covered by orders_select_participant /
-- orders_select_pending_feed (spec §7/§21).
do $$
begin
  alter table orders add column custom_delivery_lat double precision;
exception
  when duplicate_column then null;
end $$;

do $$
begin
  alter table orders add column custom_delivery_lng double precision;
exception
  when duplicate_column then null;
end $$;

do $$
begin
  alter table orders add column custom_delivery_note text;
exception
  when duplicate_column then null;
end $$;

-- ============ 6. ROUTING FOR A CUSTOM PIN ============
-- Same invoker-rights / explicit-anon-revoke posture as
-- compute_walking_route (spec §21). Snaps the given lat/lng to its
-- nearest path node live (a custom pin's location isn't known until
-- placed, so it can't be pre-snapped like a campus_points row), then
-- reuses the same last-mile-plus-graph pattern. Falls back to haversine
-- - never fails, never fabricates a routed line - if the pickup point
-- isn't graph-connected or no path node is within a sane radius (500m;
-- beyond that a "nearest node" isn't a meaningful last-mile leg).
create or replace function public.compute_walking_route_custom(
  p_pickup_id uuid, p_delivery_lat double precision, p_delivery_lng double precision
) returns table(distance_km double precision, geometry jsonb, eta_minutes double precision)
language plpgsql
set search_path = public
as $$
declare
  v_pickup campus_points%rowtype;
  v_nearest_node_id integer;
  v_nearest_dist double precision;
  v_route_distance double precision;
  v_coords jsonb;
begin
  select * into v_pickup from campus_points where id = p_pickup_id and active;
  if not found then
    raise exception 'Unknown or inactive pickup point';
  end if;

  select n.id, haversine_km(p_delivery_lat, p_delivery_lng, n.lat, n.lng)
  into v_nearest_node_id, v_nearest_dist
  from campus_path_nodes n
  order by haversine_km(p_delivery_lat, p_delivery_lng, n.lat, n.lng)
  limit 1;

  if v_pickup.nearest_path_node_id is null or v_nearest_node_id is null or v_nearest_dist > 0.5 then
    distance_km := haversine_km(v_pickup.lat, v_pickup.lng, p_delivery_lat, p_delivery_lng);
    geometry := null;
    eta_minutes := round((distance_km / 5.0 * 60)::numeric, 1);
    return next;
    return;
  end if;

  if v_pickup.nearest_path_node_id = v_nearest_node_id then
    distance_km := v_pickup.nearest_path_node_distance_km + v_nearest_dist;
    geometry := null;
    eta_minutes := round((distance_km / 5.0 * 60)::numeric, 1);
    return next;
    return;
  end if;

  select
    coalesce(sum(d.cost) filter (where d.edge <> -1), 0),
    jsonb_agg(jsonb_build_array(n.lng, n.lat) order by d.seq)
  into v_route_distance, v_coords
  from pgr_dijkstra(
    'select id, source, target, cost, reverse_cost from campus_path_edges',
    v_pickup.nearest_path_node_id,
    v_nearest_node_id,
    directed := true
  ) d
  join campus_path_nodes n on n.id = d.node;

  distance_km := v_route_distance + v_pickup.nearest_path_node_distance_km + v_nearest_dist;
  eta_minutes := round((distance_km / 5.0 * 60)::numeric, 1);
  geometry := jsonb_build_object('type', 'LineString', 'coordinates', coalesce(v_coords, '[]'::jsonb));
  return next;
end;
$$;

revoke all on function public.compute_walking_route_custom(uuid, double precision, double precision) from public;
revoke execute on function public.compute_walking_route_custom(uuid, double precision, double precision) from anon;
grant execute on function public.compute_walking_route_custom(uuid, double precision, double precision) to authenticated;

-- ============ VERIFY AFTER APPLYING ============
-- select kind, count(*) filter (where active) as active, count(*) as total from campus_points group by kind order by kind;
-- select key, label from campus_points where key in ('campus-store','prp','central-library','tt-block','dc-cafe');
-- select * from compute_walking_route_custom(
--   (select id from campus_points where key = 'one-food'),
--   12.9700, 79.1600
-- );
