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

/**
 * The Activity restructure's active/history boundary - a status is
 * either one of these two terminal end-states, or it's active. Derived
 * directly from ORDER_STATUS_TRANSITIONS above (both map to `[]`, i.e.
 * nothing transitions out of them), not redefined separately - if a
 * third terminal status is ever added to the transition map, it belongs
 * here too, not silently treated as still-active.
 */
export const TERMINAL_STATUSES: OrderStatus[] = ['delivered', 'cancelled']
export const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'accepted', 'picked_up', 'out_for_delivery']

export const isTerminalStatus = (status: OrderStatus): boolean => TERMINAL_STATUSES.includes(status)

/**
 * The deliverer-only "advance to the next status" action, shown on an
 * active delivery row - shared between ActiveOrdersSection.tsx (renders
 * the button) and DeliveringActive.tsx (performs the actual
 * updateOrderStatus call), so there is exactly one definition of what
 * the next step is and what it's called.
 */
export const NEXT_DELIVERER_ACTION: Partial<Record<OrderStatus, { label: string; next: OrderStatus }>> = {
  accepted: { label: 'Mark picked up', next: 'picked_up' },
  picked_up: { label: 'Mark out for delivery', next: 'out_for_delivery' },
}
