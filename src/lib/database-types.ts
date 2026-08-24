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
  created_at: string
  /**
   * Real column, but never selectable directly (column-level SELECT is
   * revoked - see supabase/migrations/20260824120300_otp_verification.sql).
   * Only present here so an Insert payload type-checks; use
   * get_my_order_otp()/verify_delivery_otp() to read/verify it.
   */
  otp: string | null
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
