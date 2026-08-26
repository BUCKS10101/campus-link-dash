-- Phase 3A-2 correction: Men's Hostel and Ladies Hostel blocks sharing a
-- letter (e.g. "A") are REAL, physically distinct locations with their
-- own coordinates - not the same campus_points row shown under two UI
-- labels. See PHASE3_3A_LOCATION_SPEC.md's corrected §Accommodation
-- section for the full rationale.
--
-- This migration adds the real geographic-identity column (`wing`) that
-- distinguishes them. It deliberately does NOT reassign a wing to any of
-- the 11 already-seeded single-letter blocks (B, D, E, F, G, H, J, N, P,
-- S, T) - their OSM source data never carried a gender tag, and guessing
-- which wing each belongs to would be exactly the fabrication this
-- correction exists to stop. They stay wing = null (shown under
-- Annex/Other in the picker) until confirmed one at a time, same as any
-- other unverified coordinate in this project.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

do $$
begin
  alter table campus_points add column wing text;
exception
  when duplicate_column then null;
end $$;

alter table campus_points drop constraint if exists campus_points_wing_check;
alter table campus_points add constraint campus_points_wing_check
  check (wing is null or wing in ('mens', 'ladies'));

-- ============ VERIFY AFTER APPLYING ============
-- select key, label, wing, active from campus_points where kind = 'accommodation' order by key;
