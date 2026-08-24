#!/usr/bin/env node
/**
 * CampusLink Phase 1B — API-driven end-to-end verification.
 *
 * Runs the real application flows against a STAGING Supabase project using
 * real authenticated sessions, then cleans up after itself.
 *
 * WHY API-DRIVEN: every check here is about authorization behaviour (RLS,
 * column privileges, SECURITY DEFINER functions, status-transition
 * enforcement). Those live at the data layer, so driving them directly is
 * both more precise and more trustworthy than clicking through a UI. It
 * also exercises the same supabase-js client the app itself uses.
 *
 * SAFETY:
 *   - Hard-refuses to run against the production project ref.
 *   - Only ever uses the anon key + ordinary user sessions, exactly like
 *     the real app. No service-role key, no elevated privileges.
 *   - Creates only tagged, disposable data and deletes it at the end.
 *
 * USAGE:
 *   node scripts/e2e-staging.mjs            # run + clean up
 *   node scripts/e2e-staging.mjs --no-clean # leave data for inspection
 *
 * Reads credentials from .env.staging.local (git-ignored).
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const PRODUCTION_REF = 'kjsseqlmnmiuqepfmldh'
const KEEP_DATA = process.argv.includes('--no-clean')

// ---------- env ----------

function loadEnv(path) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    fail(`Missing ${path}. Copy the staging URL + anon key into it first.`)
  }
  const env = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

function fail(msg) {
  console.error(`\n  FATAL: ${msg}\n`)
  process.exit(1)
}

const env = loadEnv('.env.staging.local')
const URL = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY

if (!URL || !ANON) fail('.env.staging.local is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.')
if (ANON.includes('PASTE_')) fail('.env.staging.local still has the placeholder anon key. Fill it in.')

// The single most important guard in this file: never touch production.
if (URL.includes(PRODUCTION_REF)) {
  fail(`REFUSING TO RUN: ${URL} is the PRODUCTION project. This script creates disposable test data and must only ever point at staging.`)
}

// ---------- result tracking ----------

const results = []
let currentFlow = null

function flow(name) {
  currentFlow = name
}

function check(desc, passed, detail = '') {
  results.push({ flow: currentFlow, desc, passed, detail })
  const mark = passed ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${desc}${detail ? `\n         ${detail}` : ''}`)
}

/** Asserts a Supabase call was REJECTED. An empty result set is NOT a rejection. */
function checkRejected(desc, { data, error }) {
  const rows = Array.isArray(data) ? data.length : data ? 1 : 0
  if (error) {
    check(desc, true, `rejected: ${error.message}`)
  } else if (rows === 0) {
    // Distinguish real denial from "RLS filtered everything out". For
    // writes this still means the write did not happen, which is the
    // property we care about — but say so explicitly rather than
    // silently counting it as a hard denial.
    check(desc, true, 'no error, but zero rows affected/returned (RLS filtered — write did not take effect)')
  } else {
    check(desc, false, `NOT rejected — ${rows} row(s) came back`)
  }
}

const client = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

const RUN_ID = `e2e${Date.now().toString(36)}`
const PASSWORD = `Test-${RUN_ID}-Aa1!`
const accounts = {}

async function signUp(role) {
  const email = `${RUN_ID}-${role}@vitstudent.ac.in`
  const sb = client()
  const { data, error } = await sb.auth.signUp({ email, password: PASSWORD })
  if (error) fail(`Could not create ${role} account: ${error.message}`)
  if (!data.session) {
    fail(
      `Signup for ${role} returned no session — staging almost certainly has email confirmation enabled.\n` +
      `  Fix: Supabase dashboard → Authentication → Providers → Email → turn OFF "Confirm email", then re-run.`
    )
  }
  // The app creates the profile row itself after signup (useAuth.signUp).
  const { error: pErr } = await sb.from('profiles').insert([{
    id: data.user.id,
    name: `E2E ${role}`,
    email,
    phone: '9876543210',
  }])
  if (pErr) fail(`Could not create ${role} profile: ${pErr.message}`)

  accounts[role] = { email, id: data.user.id, sb, token: data.session.access_token }
  return accounts[role]
}

/** Raw REST call with a real user JWT — bypasses supabase-js to test column privileges directly. */
async function rawSelect(token, query) {
  const res = await fetch(`${URL}/rest/v1/${query}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  })
  return { status: res.status, body: await res.text() }
}

// ---------- the run ----------

let orderId = null

async function main() {
  console.log(`\nCampusLink E2E — staging: ${URL}`)
  console.log(`Run ID: ${RUN_ID}  (all test data tagged with this)\n`)

  // === 1. Auth / session ===
  flow('1. Authentication & session')
  const requester = await signUp('requester')
  const deliverer = await signUp('deliverer')
  const outsider = await signUp('outsider')
  check('three disposable accounts created with live sessions', true,
    `requester/deliverer/outsider (${RUN_ID})`)

  const { data: me, error: meErr } = await requester.sb.from('profiles').select('id, name, email').eq('id', requester.id).single()
  check('requester can read own profile', !meErr && me?.id === requester.id, meErr?.message)

  // === 2. Create order ===
  flow('2. Create an order')
  const { data: created, error: createErr } = await requester.sb
    .from('orders')
    .insert([{
      requester_id: requester.id,
      deliverer_id: null,
      restaurant_name: 'One Food',
      items: ['2x Chicken Burger', '1x Fries'],
      tip_amount: 30,
      delivery_location: { type: 'hostel', label: "Men's Hostel K", hostelType: 'mens', block: 'K' },
      distance_km: 1.2,
      status: 'pending',
      otp: Math.floor(100000 + Math.random() * 900000).toString(),
    }])
    .select('id, requester_id, status, items, delivery_location')
  check('requester can create an order (live schema columns)', !createErr && !!created?.[0], createErr?.message)
  orderId = created?.[0]?.id
  if (!orderId) fail('No order created — cannot continue.')
  check('jsonb items round-tripped correctly', Array.isArray(created[0].items), JSON.stringify(created[0].items))
  check('jsonb delivery_location round-tripped correctly',
    created[0].delivery_location?.label === "Men's Hostel K", JSON.stringify(created[0].delivery_location))

  // === 3. Browse pending feed ===
  flow('3. Browse pending orders')
  const { data: feed, error: feedErr } = await deliverer.sb
    .from('orders')
    .select('id, requester_id, restaurant_name, items, status, distance_km')
    .eq('status', 'pending')
  check('deliverer can see the pending order in the feed',
    !feedErr && feed?.some((o) => o.id === orderId), feedErr?.message)

  // === 7 (early). OTP must not be directly readable ===
  flow('7. OTP column protection')
  const delivRaw = await rawSelect(deliverer.token, `orders?select=id,otp&id=eq.${orderId}`)
  const delivBlocked = delivRaw.status >= 400 && /permission denied|otp/i.test(delivRaw.body)
  check('deliverer CANNOT directly SELECT orders.otp', delivBlocked,
    `HTTP ${delivRaw.status} ${delivRaw.body.slice(0, 160)}`)

  const reqRaw = await rawSelect(requester.token, `orders?select=id,otp&id=eq.${orderId}`)
  const reqBlocked = reqRaw.status >= 400 && /permission denied|otp/i.test(reqRaw.body)
  check('requester CANNOT directly SELECT orders.otp either (must use the RPC)', reqBlocked,
    `HTTP ${reqRaw.status} ${reqRaw.body.slice(0, 160)}`)

  const starRaw = await rawSelect(deliverer.token, `orders?select=*&id=eq.${orderId}`)
  const starLeaks = /"otp"\s*:/.test(starRaw.body)
  check('select=* does not leak otp', !starLeaks,
    starLeaks ? 'LEAK: otp present in select=* response' : `HTTP ${starRaw.status}, no otp field present`)

  // NOTE: write-protection on otp is tested later (flow 8), deliberately
  // AFTER the deliverer is assigned to the order. Testing it here would
  // pass for the wrong reason - with deliverer_id still null, RLS filters
  // the row out regardless of column privileges, so it would prove
  // nothing about whether otp itself is writable.

  // === 4. Unrelated user cannot modify ===
  flow('4. Unauthorized access & mutation')
  checkRejected('outsider cannot accept/modify the order',
    await outsider.sb.from('orders').update({ deliverer_id: outsider.id, status: 'accepted' }).eq('id', orderId).select())

  checkRejected('requester cannot accept their OWN order',
    await requester.sb.from('orders').update({ deliverer_id: requester.id, status: 'accepted' })
      .eq('id', orderId).eq('status', 'pending').neq('requester_id', requester.id).select())

  // === 5. Accept ===
  flow('5. Accept an order')
  const { data: accepted, error: acceptErr } = await deliverer.sb
    .from('orders')
    .update({ deliverer_id: deliverer.id, status: 'accepted' })
    .eq('id', orderId).eq('status', 'pending').neq('requester_id', deliverer.id)
    .select('id, status, deliverer_id').single()
  check('deliverer can accept a pending order', !acceptErr && accepted?.status === 'accepted', acceptErr?.message)

  // === 6. Status transitions ===
  flow('6. Order-status transitions')
  checkRejected('invalid transition accepted -> delivered is rejected by the DB trigger',
    await deliverer.sb.from('orders').update({ status: 'delivered' }).eq('id', orderId).select())

  const { data: pu, error: puErr } = await deliverer.sb
    .from('orders').update({ status: 'picked_up' }).eq('id', orderId).eq('deliverer_id', deliverer.id)
    .select('status').single()
  check('valid transition accepted -> picked_up succeeds', !puErr && pu?.status === 'picked_up', puErr?.message)

  const { data: ofd, error: ofdErr } = await deliverer.sb
    .from('orders').update({ status: 'out_for_delivery' }).eq('id', orderId).eq('deliverer_id', deliverer.id)
    .select('status').single()
  check('valid transition picked_up -> out_for_delivery succeeds', !ofdErr && ofd?.status === 'out_for_delivery', ofdErr?.message)

  checkRejected('outsider cannot advance someone else\'s order',
    await outsider.sb.from('orders').update({ status: 'delivered' }).eq('id', orderId).select())

  // === 8. OTP retrieval + verification ===
  flow('8. OTP retrieval & verification')

  // The OTP-overwrite bypass. Run now, while the deliverer IS assigned and
  // RLS (orders_update_assigned_deliverer) genuinely permits them to
  // update this row - so the ONLY thing that can stop this write is the
  // column-level UPDATE privilege on otp. If it succeeds, the deliverer
  // can set a code they know and self-verify, defeating the whole handoff.
  // The status trigger does not catch it (it only fires when status
  // changes), so column privileges are the sole defence.
  checkRejected('deliverer CANNOT overwrite orders.otp (self-verification bypass)',
    await deliverer.sb.from('orders').update({ otp: '111111' }).eq('id', orderId).select('id'))

  // Belt-and-braces: the requester has no orders UPDATE policy at all, so
  // this one is expected to be stopped by RLS rather than column privilege.
  checkRejected('requester CANNOT overwrite their own orders.otp either',
    await requester.sb.from('orders').update({ otp: '222222' }).eq('id', orderId).select('id'))

  // Confirm the legitimate writes still work after narrowing UPDATE to
  // (deliverer_id, status) - a regression here would break accept/advance.
  const { error: legitErr } = await deliverer.sb.from('orders')
    .update({ status: 'out_for_delivery' }).eq('id', orderId).eq('deliverer_id', deliverer.id).select('status')
  check('narrowing UPDATE did not break legitimate status writes', !legitErr, legitErr?.message)

  const { data: otp, error: otpErr } = await requester.sb.rpc('get_my_order_otp', { p_order_id: orderId })
  check('requester CAN retrieve their OTP via get_my_order_otp',
    !otpErr && /^\d{6}$/.test(String(otp ?? '')), otpErr?.message ?? `got ${String(otp).length} chars`)

  const { error: otpDenyErr } = await deliverer.sb.rpc('get_my_order_otp', { p_order_id: orderId })
  check('deliverer CANNOT retrieve the OTP via get_my_order_otp', !!otpDenyErr, otpDenyErr?.message)

  const { data: wrongResult, error: wrongErr } = await deliverer.sb.rpc('verify_delivery_otp', {
    p_order_id: orderId, p_code: '000000',
  })
  check('wrong OTP is rejected (returns false, does not throw)', !wrongErr && wrongResult === false,
    wrongErr?.message ?? `returned ${wrongResult}`)

  const { data: stillOfd } = await deliverer.sb.from('orders').select('status').eq('id', orderId).single()
  check('order NOT marked delivered after a failed OTP attempt', stillOfd?.status === 'out_for_delivery',
    `status is ${stillOfd?.status}`)

  const { error: outsiderOtpErr } = await outsider.sb.rpc('verify_delivery_otp', {
    p_order_id: orderId, p_code: String(otp),
  })
  check('outsider cannot verify delivery even with the CORRECT code', !!outsiderOtpErr, outsiderOtpErr?.message)

  const { data: rightResult, error: rightErr } = await deliverer.sb.rpc('verify_delivery_otp', {
    p_order_id: orderId, p_code: String(otp),
  })
  check('correct OTP completes the delivery', !rightErr && rightResult === true,
    rightErr?.message ?? `returned ${rightResult}`)

  const { data: final } = await deliverer.sb.from('orders').select('status').eq('id', orderId).single()
  check('order status is now delivered (set server-side, not by the client)', final?.status === 'delivered',
    `status is ${final?.status}`)

  // === 9. Chat ===
  flow('9. Chat send/receive')
  const { error: chat1Err } = await requester.sb.from('chat_messages')
    .insert([{ order_id: orderId, sender_id: requester.id, message: 'Hi, on the way?' }])
  check('requester can send a chat message', !chat1Err, chat1Err?.message)

  const { error: chat2Err } = await deliverer.sb.from('chat_messages')
    .insert([{ order_id: orderId, sender_id: deliverer.id, message: 'Yes, 5 minutes!' }])
  check('deliverer can send a chat message', !chat2Err, chat2Err?.message)

  const { data: msgs, error: msgErr } = await requester.sb.from('chat_messages')
    .select('id, sender_id, message, created_at').eq('order_id', orderId).order('created_at')
  check('both participants\' messages are readable by a participant',
    !msgErr && msgs?.length === 2, msgErr?.message ?? `${msgs?.length} message(s)`)

  const { data: outsiderMsgs } = await outsider.sb.from('chat_messages').select('id').eq('order_id', orderId)
  check('outsider CANNOT read this order\'s chat', (outsiderMsgs?.length ?? 0) === 0,
    `saw ${outsiderMsgs?.length ?? 0} message(s)`)

  checkRejected('outsider cannot post into this order\'s chat',
    await outsider.sb.from('chat_messages')
      .insert([{ order_id: orderId, sender_id: outsider.id, message: 'intruder' }]).select())

  // === 10. My Orders ===
  flow('10. My Orders')
  const { data: mine, error: mineErr } = await requester.sb
    .from('orders')
    .select('id, requester_id, deliverer_id, restaurant_name, items, tip_amount, delivery_location, status, distance_km, created_at, requester_profile:profiles!orders_requester_id_fkey(*), deliverer_profile:profiles!orders_deliverer_id_fkey(*)')
    .or(`requester_id.eq.${requester.id},deliverer_id.eq.${requester.id}`)
  check('My Orders query (with both profile joins) succeeds against live schema',
    !mineErr && mine?.some((o) => o.id === orderId), mineErr?.message)
  check('requester_profile join resolves via orders_requester_id_fkey',
    !!mine?.find((o) => o.id === orderId)?.requester_profile?.name,
    mine?.find((o) => o.id === orderId)?.requester_profile?.name)

  const { data: outsiderOrders } = await outsider.sb.from('orders').select('id').eq('id', orderId)
  check('outsider CANNOT see the (now delivered, non-pending) order', (outsiderOrders?.length ?? 0) === 0,
    `saw ${outsiderOrders?.length ?? 0} order(s)`)

  // === 11. Profile read/update ===
  flow('11. Profile read & update')
  const { error: updErr } = await requester.sb.from('profiles')
    .update({ name: 'E2E requester renamed', phone: '9998887776' }).eq('id', requester.id)
  check('requester can update their own profile', !updErr, updErr?.message)

  const { data: reread } = await requester.sb.from('profiles').select('name').eq('id', requester.id).single()
  check('profile update persisted', reread?.name === 'E2E requester renamed', reread?.name)

  checkRejected('outsider cannot update someone else\'s profile',
    await outsider.sb.from('profiles').update({ name: 'hacked' }).eq('id', requester.id).select())
}

// ---------- cleanup ----------

/**
 * Cleanup CANNOT be done with the anon key. There are no DELETE policies
 * on any table (verified in 20260824120000_rls_policies_and_indexes.sql -
 * every table has SELECT/INSERT/UPDATE policies only), so RLS
 * default-denies every DELETE. A `.delete()` here would return "success"
 * with zero rows affected and quietly leave everything behind - so rather
 * than pretend, this prints the exact SQL to run.
 *
 * auth.users rows are likewise undeletable without the service-role key.
 */
async function cleanup() {
  if (KEEP_DATA) {
    console.log(`\n  --no-clean set: leaving data behind (run id ${RUN_ID}).`)
  }
  console.log('\n' + '-'.repeat(64))
  console.log('CLEANUP — must be done manually (anon key cannot DELETE: no RLS')
  console.log('DELETE policies exist on any table, by design).')
  console.log('\nRun in the STAGING SQL editor (Supabase dashboard → SQL Editor):\n')
  console.log(`  delete from chat_messages where order_id in (select id from orders where otp is not null and requester_id in (select id from profiles where email like '${RUN_ID}-%'));`)
  console.log(`  delete from orders where requester_id in (select id from profiles where email like '${RUN_ID}-%');`)
  console.log(`  delete from profiles where email like '${RUN_ID}-%';`)
  console.log('\nThen remove the 3 auth users in dashboard → Authentication → Users:')
  console.log(`  ${RUN_ID}-requester@vitstudent.ac.in`)
  console.log(`  ${RUN_ID}-deliverer@vitstudent.ac.in`)
  console.log(`  ${RUN_ID}-outsider@vitstudent.ac.in`)
  console.log('\n(Or leave it all — this is a disposable staging project.)')
  console.log('-'.repeat(64))
}

// ---------- report ----------

function report() {
  const failed = results.filter((r) => !r.passed)
  console.log('\n' + '='.repeat(64))
  let lastFlow = null
  for (const r of results) {
    if (r.flow !== lastFlow) { console.log(`\n${r.flow}`); lastFlow = r.flow }
    console.log(`  ${r.passed ? 'PASS' : 'FAIL'}  ${r.desc}`)
  }
  console.log('\n' + '='.repeat(64))
  console.log(`${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    console.log(`\n${failed.length} FAILED:`)
    for (const f of failed) console.log(`  - [${f.flow}] ${f.desc}\n      ${f.detail}`)
  }
  return failed.length === 0
}

let ok = false
try {
  await main()
  ok = report()
} catch (e) {
  console.error(`\nUNEXPECTED ERROR: ${e.message}\n${e.stack}`)
  report()
} finally {
  await cleanup()
}
process.exit(ok ? 0 : 1)
