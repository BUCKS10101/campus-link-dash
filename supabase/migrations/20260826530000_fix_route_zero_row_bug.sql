-- Phase 3A-2 routing fix, ISSUE 1: compute_walking_route() and
-- compute_walking_route_custom() silently treated "pgr_dijkstra found no
-- path" (0 rows) as "the graph segment costs 0 km", because
-- `coalesce(sum(d.cost) filter (...), 0)` collapses NULL (empty
-- aggregate over zero rows) into 0 before the code can tell the two
-- cases apart. The reported distance became just the sum of the two
-- last-mile snap distances (tiny, ~0.1km regardless of true separation),
-- and `coalesce(v_coords, '[]'::jsonb)` produced a non-null-but-empty
-- LineString, which is why `geometry is not null` checks were
-- misleadingly "true" even when no real route existed.
--
-- FIX: capture the raw (nullable) aggregate BEFORE any coalesce, and
-- branch explicitly - if it's NULL, pgr_dijkstra found no path, and we
-- fall back to the same honest haversine/geometry:null behavior the
-- null/same-node branch already used. Only once a real path is
-- confirmed do we compute distance_km/geometry from it.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

create or replace function public.compute_walking_route(p_pickup_id uuid, p_delivery_id uuid)
returns table(distance_km double precision, geometry jsonb, eta_minutes double precision)
language plpgsql
set search_path to 'public'
as $function$
declare
  v_pickup campus_points%rowtype;
  v_delivery campus_points%rowtype;
  v_route_distance double precision;
  v_coords jsonb;
begin
  select * into v_pickup from campus_points where id = p_pickup_id and active;
  if not found then
    raise exception 'Unknown or inactive pickup point';
  end if;

  select * into v_delivery from campus_points where id = p_delivery_id and active;
  if not found then
    raise exception 'Unknown or inactive delivery point';
  end if;

  if v_pickup.nearest_path_node_id is null
     or v_delivery.nearest_path_node_id is null
     or v_pickup.nearest_path_node_id = v_delivery.nearest_path_node_id then
    distance_km := haversine_km(v_pickup.lat, v_pickup.lng, v_delivery.lat, v_delivery.lng);
    geometry := null;
    eta_minutes := round((distance_km / 5.0 * 60)::numeric, 1);
    return next;
    return;
  end if;

  -- No coalesce here: sum()/jsonb_agg() over zero input rows are NULL,
  -- not 0 - that NULL is exactly the "no path" signal we need to detect.
  select
    sum(d.cost) filter (where d.edge <> -1),
    jsonb_agg(jsonb_build_array(n.lng, n.lat) order by d.seq)
  into v_route_distance, v_coords
  from pgr_dijkstra(
    'select id, source, target, cost, reverse_cost from campus_path_edges',
    v_pickup.nearest_path_node_id,
    v_delivery.nearest_path_node_id,
    directed := true
  ) d
  join campus_path_nodes n on n.id = d.node;

  if v_route_distance is null then
    -- pgr_dijkstra returned zero rows: the two points' graph nodes are
    -- not connected. Truthful fallback, same shape as the branch above -
    -- never fabricate a graph distance or a fake-empty route line.
    distance_km := haversine_km(v_pickup.lat, v_pickup.lng, v_delivery.lat, v_delivery.lng);
    geometry := null;
    eta_minutes := round((distance_km / 5.0 * 60)::numeric, 1);
    return next;
    return;
  end if;

  distance_km := v_route_distance + v_pickup.nearest_path_node_distance_km + v_delivery.nearest_path_node_distance_km;
  eta_minutes := round((distance_km / 5.0 * 60)::numeric, 1);
  geometry := jsonb_build_object('type', 'LineString', 'coordinates', v_coords);
  return next;
end;
$function$;

create or replace function public.compute_walking_route_custom(p_pickup_id uuid, p_delivery_lat double precision, p_delivery_lng double precision)
returns table(distance_km double precision, geometry jsonb, eta_minutes double precision)
language plpgsql
set search_path to 'public'
as $function$
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
    sum(d.cost) filter (where d.edge <> -1),
    jsonb_agg(jsonb_build_array(n.lng, n.lat) order by d.seq)
  into v_route_distance, v_coords
  from pgr_dijkstra(
    'select id, source, target, cost, reverse_cost from campus_path_edges',
    v_pickup.nearest_path_node_id,
    v_nearest_node_id,
    directed := true
  ) d
  join campus_path_nodes n on n.id = d.node;

  if v_route_distance is null then
    distance_km := haversine_km(v_pickup.lat, v_pickup.lng, p_delivery_lat, p_delivery_lng);
    geometry := null;
    eta_minutes := round((distance_km / 5.0 * 60)::numeric, 1);
    return next;
    return;
  end if;

  distance_km := v_route_distance + v_pickup.nearest_path_node_distance_km + v_nearest_dist;
  eta_minutes := round((distance_km / 5.0 * 60)::numeric, 1);
  geometry := jsonb_build_object('type', 'LineString', 'coordinates', v_coords);
  return next;
end;
$function$;
