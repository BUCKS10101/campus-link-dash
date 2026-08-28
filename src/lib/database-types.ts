// Simplified types to avoid complex Supabase type inference issues.
// Verified against the live database schema during the Phase 1B
// schema-mismatch review - see src/types/database.ts for the literal
// (fully-nullable) mirror this simplifies, and supabase/migrations/ for
// the constraints these shapes assume (order-status CHECK, OTP RPCs).
import type { OrderItems, DeliveryLocation } from './orderContent'

export interface Profile {
  id: string
  name: string
  email: string
  phone: string | null
  hostel_block: string | null
  hostel_type: 'mens' | 'ladies' | 'campus' | null
  rating: number | null
  successful_deliveries: number
  balance: number
  created_at: string
}

export interface Order {
  id: string
  requester_id: string
  deliverer_id: string | null
  restaurant_name: string
  items: OrderItems
  tip_amount: number
  delivery_location: DeliveryLocation
  status: 'pending' | 'accepted' | 'picked_up' | 'out_for_delivery' | 'delivered' | 'cancelled'
  distance_km: number | null
  /**
   * The campus_points row actually used to compute distance_km at creation
   * time, not a live re-resolution of restaurant_name/delivery_location -
   * see supabase/migrations/20260826100000_campus_points.sql. Both null
   * until a point on that side of the order has a seeded real coordinate
   * (see PHASE3_3A_ARCHITECTURE_PROPOSAL.md - most points don't yet).
   */
  pickup_point_id: string | null
  delivery_point_id: string | null
  /**
   * A custom (user-dropped) delivery pin - mutually exclusive with
   * delivery_point_id in practice (an order has one or the other), never
   * enforced as a DB constraint since that's a product invariant
   * PostRequest.tsx maintains. See PHASE3_3A_LOCATION_SPEC.md §14-§16.
   * The note is for human understanding only - never used for routing.
   */
  custom_delivery_lat: number | null
  custom_delivery_lng: number | null
  custom_delivery_note: string | null
  /**
   * Whether distance_km is a real routed distance, a straight-line
   * fallback, or was never resolved - set once at creation time
   * alongside distance_km itself, since the routed/fallback distinction
   * (compute_walking_route()'s geometry: null-ness) isn't reconstructible
   * later. null for every legacy (pre-3B) order - never guessed/
   * backfilled. See PHASE3_3B_NEARBY_DISCOVERY_SPEC.md §5.
   */
  distance_source: 'routed' | 'fallback' | 'unresolved' | null
  created_at: string
  /**
   * Phase 3G - see PHASE3_3G_DELIVERY_LIFECYCLE_SPEC.md. Both null unless
   * status is 'cancelled'. Server-stamped only, inside the same
   * enforce_order_status_transition() trigger that already guards the
   * 'delivered' transition - a client UPDATE can request status:
   * 'cancelled', but can never write either of these two columns
   * directly (no UPDATE grant on them, only SELECT). cancelled_by is
   * whichever participant's auth.uid() performed the cancelling write,
   * not a client-supplied id.
   */
  cancelled_at: string | null
  cancelled_by: string | null
  /**
   * Real column, but never selectable directly (column-level SELECT is
   * revoked - see supabase/migrations/20260824120300_otp_verification.sql).
   * Only present here so an Insert payload type-checks; use
   * get_my_order_otp()/verify_delivery_otp() to read/verify it.
   */
  otp: string | null
}

/**
 * Reference data only - see supabase/migrations/20260826100000_campus_points.sql
 * and 20260826150000_campus_catalog_expansion.sql. `active` is not
 * selected; RLS (campus_points_select_active) already restricts reads to
 * active rows, so every row the client ever sees has real coordinates.
 * `kind` drives the 7-category location picker - see
 * PHASE3_3A_LOCATION_SPEC.md §8.
 */
export type CampusPointKind = 'food' | 'shop' | 'accommodation' | 'academic' | 'sports' | 'medical' | 'landmark'

/**
 * Real geographic identity, not a display concern - Men's Hostel A and
 * Ladies Hostel A are physically distinct locations with their own
 * coordinates, never the same campus_points row. null for every
 * non-accommodation point, and for any accommodation point whose wing
 * hasn't been confirmed yet (never guessed - see
 * PHASE3_3A_LOCATION_SPEC.md's Accommodation correction).
 */
export type CampusPointWing = 'mens' | 'ladies' | null

export interface CampusPoint {
  id: string
  key: string
  label: string
  kind: CampusPointKind
  wing: CampusPointWing
  lat: number
  lng: number
}

/**
 * Phase 3H - see PHASE3_3H_PREFERENCES_PERSONALIZATION_SPEC.md. One row
 * per user (user_id is the primary key), created lazily on first save -
 * a user with no row is the default/legacy state (every field below at
 * its default), not an error. `discovery_radius_km`'s meaning is
 * mode-dependent: a straight-line (haversine) proximity cutoff from the
 * device's live position while `use_live_location` is on and a fresh
 * position was obtained, otherwise unused (Mode B - preferred areas - is
 * a pure membership filter with no radius component). No coordinate is
 * ever part of this row or persisted anywhere else - see the spec's
 * privacy model (§3.3).
 */
export interface UserPreferences {
  user_id: string
  discovery_radius_km: number | null
  use_live_location: boolean
  notify_chat_messages: boolean
  notify_friend_events: boolean
  discoverable: boolean
  use_friends_in_recommendations: boolean
  created_at: string
}

export const DEFAULT_USER_PREFERENCES: Omit<UserPreferences, 'user_id' | 'created_at'> = {
  discovery_radius_km: null,
  use_live_location: false,
  notify_chat_messages: true,
  notify_friend_events: true,
  discoverable: true,
  use_friends_in_recommendations: true,
}

/** A user's saved preferred campus points (Discovery Mode B) - many rows
 * per user, joined against campus_points for display/filtering. */
export interface UserPreferredPoint {
  id: string
  user_id: string
  campus_point_id: string
  created_at: string
}

export interface ChatMessage {
  id: string
  order_id: string
  sender_id: string
  message: string
  created_at: string
}

/**
 * Phase 3E - see PHASE3_3E_SOCIAL_GRAPH_SPEC.md. Only 'pending'/
 * 'accepted' are ever persisted - decline/cancel/remove all delete the
 * row instead of writing a third status (see the spec §3 for why).
 * Never written directly by the client - the five SECURITY DEFINER RPCs
 * (send_/accept_/decline_/cancel_friend_request, remove_friend) are the
 * only write path. `requester_id`/`addressee_id` record who initiated
 * the relationship (a harmless historical fact); once accepted, both
 * sides are equally "friends" regardless of who sent the request.
 */
export interface Friendship {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted'
  created_at: string
}

export interface FriendshipWithProfiles extends Friendship {
  requester_profile: Profile
  addressee_profile: Profile
}

/**
 * The shape search_profiles() returns - name + the same blended
 * reputation aggregate 3D already exposes, plus the caller's real
 * relationship to this result (derived server-side, never guessed
 * client-side). Never email/phone/hostel - see the spec §6.
 */
export interface SearchProfileResult {
  id: string
  name: string
  avg_rating: number | null
  rating_count: number
  relationship: 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends'
}

/**
 * Phase 3D - see PHASE3_3D_RATINGS_TRUST_SPEC.md. Never written directly
 * by the client - the only write path is submit_rating(), a SECURITY
 * DEFINER RPC (supabase/migrations/20260827300000_ratings.sql) that
 * derives reviewee_id/validates delivered-state server-side. RLS scopes
 * SELECT to the reviewer or reviewee only - no public review feed.
 */
export interface Rating {
  id: string
  order_id: string
  reviewer_id: string
  reviewee_id: string
  score: number
  comment: string | null
  created_at: string
}

/**
 * The shape get_profile_reputation() returns - a single blended average
 * across both rating directions (requester-rated and deliverer-rated
 * are not split in v1), computed live, never cached. avg_rating/
 * rating_count are null/0 for a profile nobody has rated yet - never a
 * fabricated default. completed_deliveries is independent of ratings
 * entirely (a real count of delivered orders where this profile was the
 * deliverer).
 */
export interface ProfileReputation {
  avg_rating: number | null
  rating_count: number
  completed_deliveries: number
}

/**
 * Phase 3I - see PHASE3_3I_ANALYTICS_INTELLIGENCE_SPEC.md. Nine plain
 * numbers from get_my_activity_summary(), scoped to auth.uid() entirely
 * server-side - never assembled from raw order rows client-side. Zero
 * counts and null averages are the honest default for a brand-new user
 * (never fabricated), not an error state.
 */
export interface MyActivitySummary {
  posted_count: number
  posted_delivered_count: number
  posted_cancelled_count: number
  accepted_count: number
  completed_deliveries: number
  deliveries_cancelled_count: number
  avg_tip_given: number | null
  avg_tip_earned: number | null
}

/** One day's order volume from get_campus_order_volume() - campus-wide,
 * never scoped to or identifying any one user. */
export interface CampusOrderVolumeDay {
  day: string
  total_orders: number
  delivered_orders: number
  cancelled_orders: number
}

/** One campus_points row's popularity from get_popular_locations() -
 * a place and a count, never a requester/deliverer. */
export interface PopularLocation {
  campus_point_id: string
  label: string
  pickup_count: number
  delivery_count: number
  total_count: number
}

/** One hour-of-day's demand from get_busy_hours() - always all 24 hours,
 * zero-filled, never a sparse/ambiguous result. */
export interface BusyHour {
  hour_of_day: number
  order_count: number
}

export interface OrderWithProfiles extends Order {
  requester_profile: Profile
  deliverer_profile: Profile | null
  is_friend?: boolean
}

export interface ChatMessageWithProfile extends ChatMessage {
  sender_profile: Profile
}

/**
 * Phase 3C - see PHASE3_3C_NOTIFICATIONS_SPEC.md. Rows are never written
 * by the client (no insert/delete grant exists on this table - see
 * supabase/migrations/20260827200000_notifications.sql and its follow-up
 * privilege fix); only read and mark-read (`read_at`) are ever performed
 * here. `type` mirrors the table's CHECK constraint exactly.
 *
 * Phase 3E added the two friend_request_* types and made order_id
 * nullable - a notification is now either order-scoped (order_id set,
 * friendship_id null) or friendship-scoped (the reverse), enforced by
 * notifications_exactly_one_subject at the DB level. See
 * PHASE3_3E_SOCIAL_GRAPH_SPEC.md §7.
 */
export type NotificationType =
  | 'order_accepted'
  | 'order_picked_up'
  | 'order_out_for_delivery'
  | 'order_delivered'
  | 'order_cancelled'
  | 'new_chat_message'
  | 'friend_request_received'
  | 'friend_request_accepted'

export interface Notification {
  id: string
  recipient_id: string
  type: NotificationType
  order_id: string | null
  friendship_id: string | null
  read_at: string | null
  created_at: string
}

/**
 * The display text for a notification is always derived from the order
 * or friendship it's about, never stored - same "derive, don't store"
 * discipline as formatOrderItems/formatDeliveryLocation in orderContent.ts.
 * `order`/`friendship` are null only if the underlying row was deleted
 * after the notification was created (on delete cascade removes the
 * notification too, so in practice this is never null for a still-
 * existing notification - kept nullable because the embedded-resource
 * shape is technically optional). Exactly one of `order`/`friendship` is
 * ever populated, matching `order_id`/`friendship_id`.
 */
export interface NotificationWithOrder extends Notification {
  order: { restaurant_name: string; requester_id: string; deliverer_id: string | null } | null
  friendship: {
    requester_id: string
    addressee_id: string
    requester_profile: { name: string } | null
    addressee_profile: { name: string } | null
  } | null
}

/**
 * Phase 3J - see PHASE3_3J_TRUST_SAFETY_SPEC.md §4. Directional, not the
 * friendships canonical-pair shape - A blocking B is a separate fact
 * from B blocking A. Never written directly by the client - the only
 * write path is block_user()/unblock_user(), two SECURITY DEFINER RPCs
 * (supabase/migrations/20260903100000_blocks.sql). RLS scopes SELECT to
 * the caller's own outgoing blocks only - never who has blocked them
 * (see the spec's privacy reasoning).
 */
export interface Block {
  id: string
  blocker_id: string
  blocked_id: string
  created_at: string
}

/** The fixed reason enum reports.reason's CHECK constraint enforces -
 * mirrors notifications.type's own fixed-enum convention. */
export type ReportReason =
  | 'no_show'
  | 'unsafe_behavior'
  | 'harassment'
  | 'inappropriate_content'
  | 'suspected_fake_account'
  | 'other'

/**
 * Phase 3J - see PHASE3_3J_TRUST_SAFETY_SPEC.md §5. Never written
 * directly by the client - the only write path is file_report(), a
 * SECURITY DEFINER RPC (supabase/migrations/20260903120000_reports.sql)
 * that rate-limits and self-report-guards server-side. RLS scopes
 * SELECT to the reporter's own filed reports only - never reports filed
 * against them, and never anyone else's. Immutable once filed: no
 * UPDATE/DELETE policy or grant exists at all.
 */
export interface Report {
  id: string
  reporter_id: string
  reported_user_id: string
  order_id: string | null
  reason: ReportReason
  description: string | null
  created_at: string
}
