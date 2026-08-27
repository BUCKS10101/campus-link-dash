-- Phase 3I: Analytics + Product Intelligence (V1) - see
-- PHASE3_3I_ANALYTICS_INTELLIGENCE_SPEC.md.
--
-- No new table, no new column, no new index. Every metric below is
-- computed live from orders/campus_points, exactly the same
-- SECURITY DEFINER-returns-only-aggregates shape get_profile_reputation()
-- already established in 20260827300000_ratings.sql - revoke-before-grant,
-- `stable` (never `volatile`), never returns a raw row or any per-user
-- identifier. No lifecycle-timing metrics (deferred per spec §K - the
-- notifications-join proxy is a secondary-purpose signal, not built
-- here) and no admin/role gating (no such concept exists in this schema;
-- every function below is granted to `authenticated` uniformly, the same
-- trust tier get_profile_reputation already grants for any profile).
--
-- Does not touch orders/campus_points RLS, grants, or triggers. Does not
-- touch notifications, user_preferences, friendships, ratings, or any
-- existing function.
--
-- STATUS: prepared in the repo. Apply to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

-- ============ PERSONAL: get_my_activity_summary() ============
-- Every count is scoped to auth.uid() - this is the same data the caller
-- could already assemble client-side from their own participant-visible
-- orders (orders_select_participant), just returned as nine numbers in
-- one round trip instead of full row data. avg_tip_given/earned are only
-- computed over delivered orders - an unresolved or cancelled order has
-- no "given/earned" tip to report, never fabricated.

create or replace function public.get_my_activity_summary()
returns table(
  posted_count integer,
  posted_delivered_count integer,
  posted_cancelled_count integer,
  accepted_count integer,
  completed_deliveries integer,
  deliveries_cancelled_count integer,
  avg_tip_given numeric,
  avg_tip_earned numeric
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    (select count(*)::int from orders where requester_id = auth.uid()),
    (select count(*)::int from orders where requester_id = auth.uid() and status = 'delivered'),
    (select count(*)::int from orders where requester_id = auth.uid() and status = 'cancelled'),
    -- "Ever accepted" - deliverer_id is set once at acceptance and never
    -- cleared (including on cancellation), so this is a true historical
    -- count, unlike a live `status = 'accepted'` snapshot which would
    -- undercount orders that progressed past that state. See spec §A.
    (select count(*)::int from orders where deliverer_id = auth.uid()),
    (select count(*)::int from orders where deliverer_id = auth.uid() and status = 'delivered'),
    (select count(*)::int from orders where deliverer_id = auth.uid() and status = 'cancelled'),
    (select round(avg(tip_amount), 2) from orders where requester_id = auth.uid() and status = 'delivered'),
    (select round(avg(tip_amount), 2) from orders where deliverer_id = auth.uid() and status = 'delivered');
$$;

revoke all on function public.get_my_activity_summary() from public, anon;
grant execute on function public.get_my_activity_summary() to authenticated;

-- ============ AGGREGATE: get_campus_order_volume(p_days) ============
-- Daily counts over the trailing p_days days (default 30, capped at 90
-- to keep the result set small and the query cheap) - total posted plus
-- how many of that day's orders have since resolved to delivered/
-- cancelled (a day's cancelled/delivered counts can still tick up after
-- the fact for orders posted that day, so these read "as of now", not
-- "as of that day" - an honest, not a historical, snapshot). Grouped only
-- by date - no requester/deliverer identifier ever appears in the
-- result, so this is safe to grant to any authenticated user exactly
-- like get_profile_reputation already is.

create or replace function public.get_campus_order_volume(p_days integer default 30)
returns table(
  day date,
  total_orders integer,
  delivered_orders integer,
  cancelled_orders integer
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    created_at::date as day,
    count(*)::int as total_orders,
    count(*) filter (where status = 'delivered')::int as delivered_orders,
    count(*) filter (where status = 'cancelled')::int as cancelled_orders
  from orders
  where created_at >= (now() - (least(greatest(p_days, 1), 90) || ' days')::interval)
  group by created_at::date
  order by day asc;
$$;

revoke all on function public.get_campus_order_volume(integer) from public, anon;
grant execute on function public.get_campus_order_volume(integer) to authenticated;

-- ============ AGGREGATE: get_popular_locations(p_limit) ============
-- Ranked by total mentions (pickup + delivery) at each real campus_points
-- row - orders with no pickup_point_id (custom pin, or legacy/pre-3A)
-- are excluded from this ranking entirely (there is nothing to attribute
-- them to), never counted against a fabricated/default location. Returns
-- a place + a count, never a requester/deliverer - the same aggregate-
-- only shape as every other function here.

create or replace function public.get_popular_locations(p_limit integer default 10)
returns table(
  campus_point_id uuid,
  label text,
  pickup_count integer,
  delivery_count integer,
  total_count integer
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with pickup_counts as (
    select pickup_point_id as point_id, count(*)::int as c
    from orders
    where pickup_point_id is not null
    group by pickup_point_id
  ),
  delivery_counts as (
    select delivery_point_id as point_id, count(*)::int as c
    from orders
    where delivery_point_id is not null
    group by delivery_point_id
  )
  select
    cp.id,
    cp.label,
    coalesce(pc.c, 0) as pickup_count,
    coalesce(dc.c, 0) as delivery_count,
    coalesce(pc.c, 0) + coalesce(dc.c, 0) as total_count
  from campus_points cp
  left join pickup_counts pc on pc.point_id = cp.id
  left join delivery_counts dc on dc.point_id = cp.id
  where coalesce(pc.c, 0) + coalesce(dc.c, 0) > 0
  order by total_count desc, cp.label asc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke all on function public.get_popular_locations(integer) from public, anon;
grant execute on function public.get_popular_locations(integer) to authenticated;

-- ============ AGGREGATE: get_busy_hours() ============
-- Hour-of-day (0-23, server/UTC-normalized via created_at's own
-- timestamptz) demand histogram, across all-time order creation - the
-- single most actionable "busy period" signal for deciding when to
-- check the board (spec §C deliberately keeps this to one dimension;
-- day-of-week is deferred, not built, to keep V1 focused). Every hour
-- from 0-23 is always present in the result (zero-filled via
-- generate_series), so the caller never has to guess whether a missing
-- hour means "zero orders" or "not computed".

create or replace function public.get_busy_hours()
returns table(
  hour_of_day integer,
  order_count integer
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    h.hour_of_day,
    count(o.id)::int as order_count
  from generate_series(0, 23) as h(hour_of_day)
  left join orders o on extract(hour from o.created_at)::int = h.hour_of_day
  group by h.hour_of_day
  order by h.hour_of_day asc;
$$;

revoke all on function public.get_busy_hours() from public, anon;
grant execute on function public.get_busy_hours() to authenticated;

-- ============ VERIFY AFTER APPLYING ============
-- Expect false:
--   select has_function_privilege('anon', 'get_my_activity_summary()', 'EXECUTE');
--   select has_function_privilege('anon', 'get_campus_order_volume(integer)', 'EXECUTE');
--   select has_function_privilege('anon', 'get_popular_locations(integer)', 'EXECUTE');
--   select has_function_privilege('anon', 'get_busy_hours()', 'EXECUTE');
-- Expect true:
--   select has_function_privilege('authenticated', 'get_my_activity_summary()', 'EXECUTE');
--   select has_function_privilege('authenticated', 'get_campus_order_volume(integer)', 'EXECUTE');
--   select has_function_privilege('authenticated', 'get_popular_locations(integer)', 'EXECUTE');
--   select has_function_privilege('authenticated', 'get_busy_hours()', 'EXECUTE');
-- Manual checks (see spec §J):
--   get_my_activity_summary() for a brand-new user with zero orders
--     returns all-zero counts and null averages, not an error.
--   get_my_activity_summary() called by user A never reflects user B's
--     orders, and vice versa - two disposable accounts with disjoint
--     order sets should return disjoint summaries.
--   get_campus_order_volume/get_popular_locations/get_busy_hours called
--     by a stranger account with zero orders of their own still return
--     the full campus-wide aggregate (proving the SECURITY DEFINER
--     bypass works for aggregates), while that same account still
--     cannot select the underlying orders rows directly beyond what
--     orders_select_participant/orders_select_pending_feed already allow.
--   get_popular_locations never includes a point with zero real
--     mentions, and never fabricates a location for a null-pickup order.
