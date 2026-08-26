-- Phase 3A-2 routing fix, ISSUE 2: the campus footway graph was
-- fragmented into ~470+ disconnected components (largest = 27 of 916
-- nodes) instead of one walkable network.
--
-- ROOT CAUSE (confirmed by direct inspection): the graph was built one
-- OSM "way" (a single tagged line) at a time - each way's own vertices
-- were correctly chained into sequential edges (node 0-1-2-...-11 is one
-- footway, in order), but no node-deduplication/snapping step ran
-- ACROSS different ways. Real-world junctions where two separate ways
-- meet, cross, or run immediately alongside each other were exported as
-- two (or more) independently-numbered nodes at nearly the same
-- coordinate, with no edge ever linking them - so the routing graph
-- never learns that a person could simply step from one way onto the
-- other at that point, even though the original OSM topology (and the
-- already-existing public/campus-map.geojson visual export, which
-- traces the same real paths) shows them meeting there. This is NOT a
-- uniform bug - 233 nodes already have degree >= 3 (proper shared
-- junctions preserved correctly for some way pairs) - it's a partial/
-- inconsistent extraction gap, confirmed by:
--   - 178 pairs of nodes sit within 3m of each other yet carry different
--     IDs and share no edge.
--   - 175 of those 178 pairs are between two nodes that ALREADY have
--     degree >= 2 (i.e. two separate, already-internally-connected way
--     chains passing right by/through each other without ever being
--     spliced) - this isn't primarily "dangling dead-ends near
--     something", it's "crossing paths never noded together".
--
-- FIX: for every pair of nodes within a 2-meter tolerance that do NOT
-- already share a direct edge, add a real bidirectional connector edge
-- costed at their ACTUAL haversine distance (a few meters, not a
-- fabricated shortcut) - this is node-welding/snapping, the same step
-- any proper OSM-to-routing-graph pipeline (e.g. osm2pgrouting) performs
-- as part of ordinary graph construction. It uses only the existing
-- node coordinates already in campus_path_nodes; no new geometry, no
-- invented waypoints, no connection between genuinely distant locations.
--
-- Tolerance choice (2m = 0.002km): validated before writing this
-- migration via pgr_connectedComponents() simulation - 2m already grows
-- the largest component from 27 to 729 of 916 nodes; 3m/5m tolerance
-- barely changes that (731), confirming 2m captures the real
-- near-duplicate-junction population without reaching into
-- coincidentally-nearby-but-unrelated geometry.
--
-- KNOWN RESIDUAL GAP, NOT FIXED HERE: One Food World's own local path
-- cluster (15 nodes, incl. its snapped node) remains genuinely isolated
-- even after this fix - the nearest point in the rest of the network is
-- ~98m away, and that same ~98m gap is ALSO present in
-- public/campus-map.geojson's visual path data (checked directly - the
-- path vertices near One Food World simply stop ~98m short of the next
-- nearest path feature). This is a real hole in the extracted OSM
-- footway data itself, not a graph-construction artifact - bridging it
-- would mean fabricating an edge across real, unmapped distance, which
-- is explicitly out of scope for this migration. Routes involving One
-- Food World will continue to honestly fall back to haversine
-- (geometry: null) until a wider/different OSM extraction actually
-- captures a connecting path there.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

insert into campus_path_edges (source, target, cost, reverse_cost)
select n1.id, n2.id, haversine_km(n1.lat, n1.lng, n2.lat, n2.lng), haversine_km(n1.lat, n1.lng, n2.lat, n2.lng)
from campus_path_nodes n1
join campus_path_nodes n2 on n1.id < n2.id
where haversine_km(n1.lat, n1.lng, n2.lat, n2.lng) < 0.002
and not exists (
  select 1 from campus_path_edges e
  where (e.source = n1.id and e.target = n2.id)
     or (e.source = n2.id and e.target = n1.id)
);

-- Re-snap every active campus_points row to the (unchanged node set,
-- newly reconnected edge set) graph, per instruction - the node table
-- itself wasn't touched, so this should reproduce the same
-- nearest_path_node_id values, but re-running it is the honest way to
-- confirm that rather than assume it.
update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.active and cp2.lat is not null
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
