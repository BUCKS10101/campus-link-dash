import type { NotificationType } from './database-types'

/**
 * One sentence per event type, derived from the order it's about - never
 * stored (see NotificationWithOrder in database-types.ts). Only five
 * types exist (the table's CHECK constraint), so a switch is exhaustive
 * and needs no fallback branch.
 */
export const formatNotificationText = (type: NotificationType, restaurantName: string): string => {
  switch (type) {
    case 'order_accepted':
      return `Someone accepted your ${restaurantName} order.`
    case 'order_picked_up':
      return `Your ${restaurantName} order was picked up.`
    case 'order_out_for_delivery':
      return `Your ${restaurantName} order is out for delivery.`
    case 'order_delivered':
      return `Your ${restaurantName} order was delivered.`
    case 'new_chat_message':
      return `New message about your ${restaurantName} order.`
  }
}

/** Locked per Phase 3C approval: cap the visible badge at "9+", never a large multi-digit number. */
export const formatUnreadCount = (count: number): string => (count > 9 ? '9+' : String(count))
