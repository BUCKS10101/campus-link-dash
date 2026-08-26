-- Phase 3D: ratings + trust - see PHASE3_3D_RATINGS_TRUST_SPEC.md.
--
-- REVOKE-before-GRANT from the start, not as a follow-up fix. 3C's first
-- migration attempt found - only after applying - that Supabase's
-- platform-level default `GRANT ALL ON TABLES/FUNCTIONS TO anon,
-- authenticated` silently defeated additive column-level grants and
-- direct EXECUTE grants alike. This migration revokes everything first,
-- then grants back only what's actually needed, and is verified live
-- immediately after applying (see the spec's §6 verification plan)
-- before any frontend code is written against it.
--
-- Additive only: one new table, two new SECURITY DEFINER functions.
-- Does not touch orders/chat_messages/notifications/profiles RLS, grants,
-- or triggers. Does not use profiles.rating/.successful_deliveries/
-- .balance anywhere - reputation is computed live from ratings/orders.

-- ============ TABLE ============

create table if not exists ratings (
  id uuid not null default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  reviewer_id uuid not null references profiles(id) on delete cascade,
  reviewee_id uuid not null references profiles(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 300),
  created_at timestamptz not null default now(),
  constraint ratings_pkey primary key (id),
  constraint ratings_order_reviewer_key unique (order_id, reviewer_id)
);

create index if not exists ratings_reviewee_idx on ratings (reviewee_id);

-- ============ RLS ============
-- Row-level visibility is participant-only (reviewer or reviewee) - see
-- spec §8. Aggregate reputation is exposed separately via
-- get_profile_reputation() below, which bypasses this policy on purpose
-- (SECURITY DEFINER) since it only ever returns aggregate numbers, never
-- raw rows.

alter table ratings enable row level security;

drop policy if exists "ratings_select_participant" on ratings;
create policy "ratings_select_participant"
  on ratings for select
  using (auth.uid() = reviewer_id or auth.uid() = reviewee_id);

-- No insert/update/delete policy exists for any client role - the only
-- write path is submit_rating() below, which runs as its owner and
-- bypasses grants/RLS for its own insert. No edit/delete in v1 (spec §3).

revoke all on ratings from anon, authenticated;
grant select on ratings to authenticated;
-- anon gets nothing: ratings_select_participant requires auth.uid(),
-- which an anonymous session can never satisfy.

-- ============ WRITE PATH: submit_rating() ============
-- Everything the browser could lie about - who the reviewee is, whether
-- the caller actually participated, whether the order is really
-- delivered - is resolved from the trusted orders row inside this
-- function, never taken as a parameter. Mirrors verify_delivery_otp()'s
-- shape exactly (20260824120300_otp_verification.sql): look up the
-- trusted row, validate against auth.uid(), validate state, act.

create or replace function public.submit_rating(
  p_order_id uuid, p_score smallint, p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order orders%rowtype;
  v_reviewee uuid;
  v_rating_id uuid;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;

  if auth.uid() is distinct from v_order.requester_id
     and auth.uid() is distinct from v_order.deliverer_id then
    raise exception 'You are not a participant on this order';
  end if;

  if v_order.status <> 'delivered' then
    raise exception 'This order has not been delivered yet';
  end if;

  if p_score < 1 or p_score > 5 then
    raise exception 'Score must be between 1 and 5';
  end if;

  v_reviewee := case when auth.uid() = v_order.requester_id
    then v_order.deliverer_id else v_order.requester_id end;

  insert into ratings (order_id, reviewer_id, reviewee_id, score, comment)
  values (p_order_id, auth.uid(), v_reviewee, p_score, nullif(trim(p_comment), ''))
  returning id into v_rating_id;

  return v_rating_id;
exception
  when unique_violation then
    raise exception 'You already rated this order';
end;
$$;

revoke all on function public.submit_rating(uuid, smallint, text) from public, anon;
grant execute on function public.submit_rating(uuid, smallint, text) to authenticated;

-- ============ READ PATH: get_profile_reputation() ============
-- Live aggregation, no cache table (spec §7). completed_deliveries is
-- independent of ratings entirely - a direct count of delivered orders
-- where this profile was the deliverer. SECURITY DEFINER exists only so
-- this can read across all ratings rows regardless of the caller's own
-- participant-scoped SELECT policy above; it never returns anything
-- beyond three aggregate numbers, so there is no exposure risk in that.

create or replace function public.get_profile_reputation(p_profile_id uuid)
returns table(avg_rating numeric, rating_count integer, completed_deliveries integer)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    (select round(avg(score), 1) from ratings where reviewee_id = p_profile_id),
    (select count(*)::int from ratings where reviewee_id = p_profile_id),
    (select count(*)::int from orders where deliverer_id = p_profile_id and status = 'delivered');
$$;

revoke all on function public.get_profile_reputation(uuid) from public, anon;
grant execute on function public.get_profile_reputation(uuid) to authenticated;

-- ============ VERIFY AFTER APPLYING ============
-- Expect false:
--   select has_table_privilege('anon', 'ratings', 'INSERT');
--   select has_table_privilege('authenticated', 'ratings', 'INSERT');
--   select has_table_privilege('anon', 'ratings', 'SELECT');
--   select has_function_privilege('anon', 'submit_rating(uuid,smallint,text)', 'EXECUTE');
--   select has_function_privilege('anon', 'get_profile_reputation(uuid)', 'EXECUTE');
-- Expect true:
--   select has_table_privilege('authenticated', 'ratings', 'SELECT');
--   select has_function_privilege('authenticated', 'submit_rating(uuid,smallint,text)', 'EXECUTE');
--   select has_function_privilege('authenticated', 'get_profile_reputation(uuid)', 'EXECUTE');
