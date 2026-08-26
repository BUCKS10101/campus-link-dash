-- Phase 3F: smart matching - see PHASE3_3F_SMART_MATCHING_SPEC.md §11.
--
-- The only concrete new requirement 3F found: get_profile_reputation()
-- (3D) takes one profile id at a time, which would be an N+1 query
-- against a whole Home feed. This is a new function, not new schema -
-- no table, no column, no cache. Same privacy posture as the existing
-- single-id version: aggregate numbers only, never a raw row, never a
-- comment.

create or replace function public.get_profiles_reputation(p_profile_ids uuid[])
returns table(id uuid, avg_rating numeric, rating_count integer)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select p.id,
    (select round(avg(r.score), 1) from ratings r where r.reviewee_id = p.id),
    (select count(*)::int from ratings r where r.reviewee_id = p.id)
  from unnest(p_profile_ids) as p(id);
$$;

revoke all on function public.get_profiles_reputation(uuid[]) from public, anon;
grant execute on function public.get_profiles_reputation(uuid[]) to authenticated;

-- ============ VERIFY AFTER APPLYING ============
-- Expect false:
--   select has_function_privilege('anon', 'get_profiles_reputation(uuid[])', 'EXECUTE');
-- Expect true:
--   select has_function_privilege('authenticated', 'get_profiles_reputation(uuid[])', 'EXECUTE');
