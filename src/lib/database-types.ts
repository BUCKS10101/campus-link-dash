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

export interface OrderWithProfiles extends Order {
  requester_profile: Profile
  deliverer_profile: Profile | null
  is_friend?: boolean
}

export interface ChatMessageWithProfile extends ChatMessage {
  sender_profile: Profile
}
