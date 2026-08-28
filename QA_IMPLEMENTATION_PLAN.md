# CampusLink — Production QA / Reliability Audit

**Status:** IN PROGRESS. This document is updated as each phase completes — it is the live source of truth for this audit, not a one-time report.

**Started:** 2026-08-29
**Auditor:** Claude (agent), at the direction of the project owner
**Scope:** Full production QA sweep per the audit brief. Branch-per-issue, direct merge to `main` per explicit instruction (no PRs for this audit).

---

## 1. Architecture overview

**Stack:** Vite + React + TypeScript + react-router-dom (`BrowserRouter`) + Tailwind, shadcn/ui primitives. Backend: Supabase (Postgres + Auth + Storage + Realtime). Hosting: Vercel (production deploys from `main`). Email: Supabase Auth → Resend (SMTP), recently connected — still stabilizing per the project owner.

**Two Supabase projects:**
- **Production**: `kjsseqlmnmiuqepfmldh` — what Vercel's production deployment actually talks to (`.env.production`). Real user data now exists here (see §Known temporary changes).
- **Staging**: `wemjskpbulebxgyhyhmk` — used for development/dry-run verification (`.env.staging.local`, `.env`, the default for `npm run dev`).

Both are on the same migration set as of `main` HEAD, with production intentionally missing one migration (`20260903180000_email_verification_enforcement.sql`, held back — see §15 below) and having one migration's flag-guarded behavior (grandfather backfill) intentionally never triggered.

**Routing** (`src/App.tsx`): single `BrowserRouter`, one `ProtectedRoute` + `AppShell` wrapping every authenticated route. `/login` is the only unauthenticated route. **No `/forgot-password` or `/reset-password` route exists** (confirmed by direct inspection — see Phase 2D).

**Auth** (`src/hooks/useAuth.tsx`): a single `AuthProvider` context, one shared `onAuthStateChange` listener for the whole app. `signUp()` calls `supabase.auth.signUp()` then inserts a `profiles` row client-side (no DB trigger auto-creates it). `signIn()` calls `signInWithPassword()`. `AuthUser.emailVerified` is derived from `session.user.email_confirmed_at`, Supabase-native, not a custom column.

**Database schema**: `profiles`, `orders`, `chat_messages`, `friendships`, `notifications`, `ratings`, `user_preferences`, `user_preferred_points`, `campus_points`/`campus_path_nodes`/`campus_path_edges` (map/routing), `blocks`, `reports`, `rate_limit_events`. Every write-path table uses either direct-insert + RLS, or a `SECURITY DEFINER` RPC for anything needing cross-row logic (self-action guards, rate limits, block checks). Full migration history in `supabase/migrations/` (77 files, chronological, additive-only convention — see any file's own header comments for the exact reasoning behind it).

**Storage**: one bucket, `avatars` (public read, owner-scoped write via RLS on `storage.objects`, added 2026-08-28/29 for the profile-avatar feature).

**Rate limiting**: a shared `rate_limit_events` table + `check_and_record_rate_limit(action, limit, window_minutes)` `SECURITY DEFINER` function, invoked via `BEFORE INSERT/UPDATE` triggers on `orders` (creation: 5/60min, acceptance: 10/10min), `chat_messages` (30/10min per order), and inside `send_friend_request()` (10/60min). This is the **only** rate limiter in the system — there is no separate Vercel/API/IP-based limiter.

**Email verification / domain restriction**: two independent layers — client-side Zod regex (`validation.ts`) and a server-side `BEFORE INSERT` trigger on `auth.users` (`enforce_vit_email_domain`). **Both are currently disabled as a deliberate, temporary, tracked change** — see §15.

---

## 2. Known temporary production changes (carried over from prior work — MUST NOT be lost track of)

| # | What | Where | Status |
|---|---|---|---|
| 1 | VIT-domain client check disabled | `src/lib/validation.ts` (commit `b7e8dba` on `main`) | **Still disabled** as of this audit's start |
| 2 | VIT-domain server trigger neutralized | `public.enforce_vit_email_domain()` on **production** DB, live no-op override, not a migration file change. Trigger itself still attached/enabled. | **Still disabled** as of this audit's start |
| 3 | `20260903180000_email_verification_enforcement.sql` | Never applied to production (deliberate — would have gated 8 real pre-existing unconfirmed accounts) | Not applied |

**These will not be reverted as a side effect of this audit.** Per the brief: report explicitly at the end of email-flow testing (Phase 2/14) whether they should now be restored, and wait for explicit instruction before touching them.

**New fact discovered during this audit's first probe (2026-08-29):** production's Supabase "Confirm Email" setting is now **ON** (a fresh `signUp()` no longer returns a live session — confirmed empirically, not assumed). This was not changed by any agent action in this conversation's history; it must have been changed directly in the Supabase Dashboard, presumably while setting up Resend. This materially changes signup/login behavior from what was true earlier in this project's history and is treated as the current real state throughout this audit.

---

## 3. Test matrix

Legend: **PASS** / **FAIL** / **PENDING** (not yet executed this pass).

### Phase 2 — Authentication

| ID | Test | Steps | Expected | Actual | Result | Root cause | Fix | Branch |
|---|---|---|---|---|---|---|---|---|
| AUTH-01 | Fresh signup | signUp() with new VIT email | User + profile created, unconfirmed, no session (Confirm Email is ON) | Confirmed exactly this, empirically against production | PASS | n/a | n/a | n/a |
| AUTH-02 | Re-signup, same email, still unconfirmed | signUp() again before confirming | Same user id returned, confirmation email resent, no duplicate row | Confirmed exactly this (after Supabase's own 56s cooldown) | PASS | n/a | n/a | n/a |
| AUTH-03 | Re-signup, email already confirmed | signUp() with an existing, confirmed email | Should be clearly told "already registered," not treated as a new signup | Supabase returns `error: null` + a **fabricated user object** (different id, empty `identities: []`) — Supabase's documented anti-enumeration signal. No duplicate DB row (confirmed). **But the frontend doesn't check for this signal** — shows "Account created! Check your email" and navigates to `/verify-email`, which is actively misleading. | **FAIL** | Frontend never inspects `data.user.identities` to detect Supabase's "already registered" signal | See Fix #1 below | `qa/auth-duplicate-signup` |
| AUTH-04 | Login: correct email + correct password, unconfirmed account | signInWithPassword() | Rejected with a clear "confirm your email first" message | `error: "Email not confirmed"`, status 400 — rejected correctly, but message isn't user-friendly in the UI (shows raw Supabase text) | PASS (functionally) / minor UX gap noted | n/a (see Fix #1, bundled messaging improvement) | — | `qa/auth-duplicate-signup` |
| AUTH-05 | Login: correct email + wrong password | signInWithPassword() | Rejected, no session, clear error | `error: "Invalid login credentials"`, status 400. Frontend already translates this to "That email and password don't match." | PASS | n/a | n/a | n/a |
| AUTH-06 | Login: nonexistent email | signInWithPassword() | Rejected, same generic message (no user enumeration via error text) | `error: "Invalid login credentials"` — same message as AUTH-05, correctly indistinguishable | PASS | n/a | n/a | n/a |
| AUTH-07 | Login: correct email + correct password, confirmed account | signInWithPassword() | Succeeds | Confirmed | PASS | n/a | n/a | n/a |
| AUTH-08 | Login: correct email + wrong password, confirmed account | signInWithPassword() | Rejected | Confirmed rejected | PASS | n/a | n/a | n/a |
| AUTH-09 | "Forgot password?" exists on login screen | Visual/code inspection | A visible option, linking to a working reset flow | **Confirmed absent** — no such element in `Login.tsx`, no `/forgot-password` route in `App.tsx`, no `resetPasswordForEmail` call anywhere in the codebase | **FAIL** | Feature was never built | See Fix #2 below | `qa/auth-forgot-password` |
| AUTH-10 | Session persistence across refresh/nav/close-reopen | Manual browser test | Session persists via Supabase's own localStorage-backed client | Not yet executed this pass (requires a real browser) | PENDING | — | — | — |
| AUTH-11 | "Password not matching after logout" (user-reported) | Investigate root cause | — | Most likely explanation: a direct consequence of AUTH-03 — re-registering an already-confirmed account produces a misleading "success" with no actual password change, so the *original* password remains correct while the UI implies a new one was just set. Not independently reproduced as a distinct bug; expected to disappear once AUTH-03 is fixed. | Provisional — will re-verify after Fix #1 | Same as AUTH-03 | Same as AUTH-03 | `qa/auth-duplicate-signup` |

### Phases 3–13

**Not yet executed this pass** — pending after the Phase 2 fixes land and after Phase 6 (posting rate-limit, explicitly reported as broken) is investigated. Tracked as open work below, not silently dropped.

### Phase 6 — Posting / rate limiting

| ID | Test | Steps | Expected | Actual | Result | Root cause | Fix | Branch |
|---|---|---|---|---|---|---|---|---|
| POST-01 | Rate-limit error while posting a request | Investigate | — | PENDING — investigating next | PENDING | — | — | `qa/posting-rate-limit` |

### Phase 15 — Temporary VIT changes disposition

Reported at the end of email-flow testing, not yet — see §2 above for current tracked state.

---

## 4. Fixes landed this pass

(Updated as each branch merges — see individual entries above for status.)

| Fix # | Issue | Branch | Commit | Merged to main | Regression checked |
|---|---|---|---|---|---|
| 1 | AUTH-03/AUTH-04/AUTH-11 — duplicate-registration false success | `qa/auth-duplicate-signup` | `e8660fa` | ✅ merged | 581 tests, 579 pass (2 pre-existing unrelated failures), tsc/lint/build clean |
| 2 | AUTH-09 — missing forgot-password flow | `qa/auth-forgot-password` | pending merge | pending | 599 tests, 597 pass (same 2 pre-existing unrelated failures), tsc/lint/build clean |

### Fix #2 detail (AUTH-09)

**Root cause:** the feature simply never existed — no "Forgot password?" UI, no route, no `resetPasswordForEmail`/`updateUser` calls anywhere in the codebase (confirmed by full-repo search before writing any code).
**Fix:** rides entirely on Supabase's own native password-recovery mechanism, same "no custom token system" discipline as the existing email-verification flow.
- `useAuth.tsx`: two new functions, `sendPasswordResetEmail(email)` (calls `resetPasswordForEmail` with `redirectTo: {origin}/reset-password`) and `updatePasswordAfterReset(newPassword, confirmPassword)` (calls `updateUser({password})` — deliberately no current-password reproof, unlike `changePassword()`, since a forgotten password can't satisfy that by definition).
- `Login.tsx`: a third `step: 'forgot'` mode alongside the existing login/register steps — "Forgot password?" link next to the password field, single-email form, and a deliberately identical confirmation message regardless of whether the account actually exists (matches Supabase's own anti-enumeration response shape, verified empirically — see below).
- New `src/pages/ResetPassword.tsx` + route `/reset-password`: new-password form, same expired/invalid-link handling pattern as the existing `VerifyEmail.tsx` (`error_code=otp_expired` etc.).
- `validation.ts`: `ForgotPasswordSchema`, `ResetPasswordSchema` (mirrors `ChangePasswordSchema`'s match-confirmation shape).

**Known, documented scope decision (not a silent gap):** `/reset-password` sits behind the same `ProtectedRoute` as every other authenticated page, gated only on "has a session" — it does not additionally verify the session specifically came from a recovery link (vs. any other already-open session). An attacker already holding a live session could reach this form without re-proving the current password. Accepted for this audit's scope: such an attacker could already do comparably sensitive things with that session; building session-type tracking into the shared `AuthProvider` to close this narrow gap is a larger change than this fix warrants. Flagged here explicitly rather than treated as fully closed.

**Verified:** real `resetPasswordForEmail()` call against production for both a real confirmed account and a nonexistent one — confirmed identical `error: null` response either way (no enumeration leak), matching the UI's own deliberately-identical messaging.

**Outstanding manual step, cannot be verified from here:** Supabase Dashboard → Authentication → URL Configuration → Redirect URLs must include `https://<production-domain>/reset-password` or the emailed link will fail on click, same consideration as the existing `/verify-email` redirect. Flagging for the project owner to confirm, same as this project's established convention for this exact class of setting.

### Fix #1 detail (AUTH-03 / AUTH-04 / AUTH-11)

**Root cause:** `useAuth.tsx`'s `signUp()` never inspected `data.user.identities` — Supabase's documented anti-enumeration signal (`identities: []` + `error: null` + a fabricated, never-persisted user id) for "this email is already registered and confirmed." The code proceeded as if it were a real signup.
**Fix:** detect `data.user.identities.length === 0` immediately after the `signUp()` call and throw a clear "already exists, try signing in" error before attempting the (doomed-to-fail) profile insert. Also improved the adjacent "Email not confirmed" login error message.
**Files:** `src/hooks/useAuth.tsx`, `src/pages/Login.tsx` (+ tests).
**Verified:** empirically against production before writing the fix (see AUTH-01 through AUTH-08 above); the added unit test exercises the real `signUp()` function with a mock shaped exactly like the confirmed real Supabase response.
**AUTH-11 status:** now expected resolved as a direct consequence — no independent fix needed, will re-confirm if the user reports it again post-deploy.

---

## 5. Open work (not yet reached this pass)

- Phase 3 (personalized greeting) — already implemented and shipped in a prior session; needs re-verification against the *current* production state (Confirm Email now ON) as part of this audit's regression pass, not assumed still correct.
- Phase 4 (profile page dynamic name/phone) — same: implemented previously, needs re-verification here.
- Phase 5 (avatar system) — same: implemented previously, needs re-verification here, including the failure/oversized/unsupported-file/cancel cases the original implementation pass didn't explicitly re-test post-Confirm-Email-change.
- Phase 6 (posting rate limit) — investigation started, see above.
- Phase 7 (text/chat feature).
- Phase 8 (map).
- Phase 9 (distance analysis).
- Phase 10 (notifications).
- Phase 11 (friends).
- Phase 12 (activity).
- Phase 13 (security/RLS sanity pass) — largely covered by the extensive 3J audit work already in this project's history, but will be re-checked, not assumed.
- Phase 14 (email/Resend pipeline — SPF/DKIM/DMARC/template) — requires Resend dashboard access this agent does not have; will report what's checkable from the Supabase/code side only.

This document will be updated as each of these is executed.
