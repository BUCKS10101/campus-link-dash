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

export interface ChatMessage {
  id: string
  order_id: string
  sender_id: string
  message: string
  created_at: string
}

/**
 * Live schema is a request/accept model (requester_id, addressee_id,
 * status), but no friend-request/accept/decline/unfriend UI or handler
 * exists anywhere in the app - see the friendships RLS review. `status`
 * is typed loosely (no confirmed vocabulary) rather than as a union.
 */
export interface Friendship {
  id: string
  requester_id: string
  addressee_id: string
  status: string
  created_at: string
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
 * here. `type` mirrors the table's CHECK constraint exactly - only these
 * five events are ever produced by the two SECURITY DEFINER triggers.
 */
export type NotificationType =
  | 'order_accepted'
  | 'order_picked_up'
  | 'order_out_for_delivery'
  | 'order_delivered'
  | 'new_chat_message'

export interface Notification {
  id: string
  recipient_id: string
  type: NotificationType
  order_id: string
  read_at: string | null
  created_at: string
}

/**
 * The display text for a notification is always derived from the order
 * it's about (restaurant_name), never stored - same "derive, don't store"
 * discipline as formatOrderItems/formatDeliveryLocation in orderContent.ts.
 * `order` is null only if the underlying order row was deleted after the
 * notification was created (on delete cascade removes the notification
 * too, so in practice this is never null - kept nullable because the
 * embedded-resource shape is technically optional).
 */
export interface NotificationWithOrder extends Notification {
  order: { restaurant_name: string } | null
}
