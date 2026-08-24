# Applying these migrations

These files are prepared in the repo but **have not been applied or verified
against any live Supabase project** as part of this change — nobody ran them
here because this environment only has the `anon` API key (no service-role
key, DB connection string, or Supabase CLI login). `SETUP.sql` being present
in earlier commits doesn't mean these protections are live either — SQL
files in git are not self-executing.

**These were already rewritten once** after a first apply attempt failed —
the original draft was written against an assumed schema
(`orders.customer_id`, `orders.otp_code`, `profiles.full_name`,
`friendships.user_id/friend_id`, `orders.price/pickup_location/updated_at/
completed_at`) that doesn't match the live database at all. Every file below
was rewritten against the actual live schema, confirmed via
`information_schema.columns` + `pg_constraint` + `pg_policies` on
2026-08-24. See the Phase 1B schema-mismatch report (in conversation) for
the full column-by-column diff. **The frontend code (`src/hooks/*`,
`src/pages/*`) still assumes the old, wrong schema and needs its own
follow-up correction — that's a separate piece of work from these
migrations.**

## Before running anything

`orders` and `friendships` were confirmed empty (0 rows) as of the last
check. If that's changed, re-verify before applying
`20260824120100_order_status_integrity.sql` (adds a CHECK constraint on
`orders.status`) — see that file's header for what to check.

## Option A: Supabase CLI (recommended, repeatable)

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

`db push` applies every file in this directory in filename order, in its own
transaction per file, and records what's been applied in the
`supabase_migrations.schema_migrations` table. Every statement in every file
here is now idempotent (`drop policy if exists` before each `create
policy`, `create index if not exists`, a `duplicate_object`-guarded `do`
block around each `add constraint`), so re-running this after a partial
failure is safe.

## Option B: Supabase SQL editor (manual)

Open Project → SQL Editor → New query in the Supabase dashboard and run each
file in this directory **in filename order** (they are numbered):

0. `20260824115900_baseline_schema.sql` — creates the four tables every
   other migration assumes. Added 2026-08-25 after discovering the repo
   could not stand up a fresh database at all (no migration created any
   tables; production's were made outside this repo). Fully `if not
   exists`-guarded, so it is a **no-op against production** and only does
   real work on a fresh project.
1. `20260824120000_rls_policies_and_indexes.sql`
2. `20260824120100_order_status_integrity.sql`
3. `20260824120200_foreign_keys.sql` — safe: every FK in it already exists
   live, so this is a no-op verification pass.
4. `20260824120250_profiles_auth_users_fk.sql` — confirmed safe against
   current data as of 2026-08-24 (the orphan check in its header returned
   zero rows). Still deliberately split into its own file so that if it
   ever does fail (e.g. after new data is added some other way), it fails
   alone and doesn't block/roll back anything else. Re-run the orphan
   check first if meaningful time has passed since this was checked.
5. `20260824120300_otp_verification.sql`
6. `20260825090000_fix_otp_column_privileges.sql` — **required, not
   optional.** A live privilege check on 2026-08-25 showed the column-level
   revoke in file 5 above did not actually work (anon/authenticated could
   both still `SELECT` `orders.otp`) - see that file's header for the root
   cause (a column-level REVOKE can't override Supabase's default
   table-level SELECT grant) and the fix (revoke the table-level grant,
   re-grant column-level SELECT on everything except otp).

The SQL editor runs a pasted script as one transaction by default, so if a
file errors partway through, nothing from that file is left half-applied —
this was confirmed by checking `pg_class.relrowsecurity` and `pg_policies`
after the original failed attempt, both showed a clean slate rather than a
partial state.

## Verifying it actually applied

After running, confirm in the dashboard rather than trusting the SQL ran
clean:

- **Database → Tables → `orders`/`profiles`/`chat_messages`/`friendships`**:
  each should show "RLS enabled" with the policies listed under Policies.
  `friendships` should show exactly one policy (`friendships_select_own`)
  — that's deliberate, not incomplete. Friend requests, accept/decline, and
  unfriending are unbuilt features with zero supporting code, so no
  INSERT/UPDATE/DELETE policy was added for them; until that feature is
  designed, all writes to `friendships` are blocked at the DB level by
  RLS's default-deny.
- **Database → Tables → `orders` → Constraints**: `orders_status_check`,
  `orders_requester_id_fkey`, `orders_deliverer_id_fkey` should be present.
- **Database → Tables → `profiles` → Constraints**: `profiles_id_fkey`
  should be present *only if* you ran migration 4 and it succeeded.
- **Database → Functions**: `get_my_order_otp`, `verify_delivery_otp`,
  `enforce_order_status_transition` should be listed.
- Try, from a second test account, to `select` another user's order or
  `update` an order you're not assigned to via the Supabase JS client / REST
  API directly — it should be rejected once RLS is actually enabled.
- **Specifically re-check `otp` after applying file 6**: RLS policies
  passing is not enough — privileges are a separate layer. Run
  `select id, otp from orders limit 1;` via the anon key (no `Authorization`
  header, or a plain unauthenticated REST call) and confirm it now returns
  a permission-denied error instead of `200 []`. A `200` with an empty
  array is not proof of protection — an empty table returns that either
  way; only an actual permission error confirms the column is locked down.
