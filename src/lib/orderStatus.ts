import type { Order } from '@/lib/database-types'

export type OrderStatus = Order['status']

/**
 * Allowed status transitions. Mirrored exactly by the
 * `enforce_order_status_transition` trigger in
 * supabase/migrations/0002_order_status_transitions.sql — if you change
 * this map, update that trigger too.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['accepted', 'cancelled'],
  accepted: ['picked_up', 'cancelled'],
  picked_up: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

export const isValidOrderStatusTransition = (from: OrderStatus, to: OrderStatus): boolean => {
  if (from === to) return false
  return ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false
}
