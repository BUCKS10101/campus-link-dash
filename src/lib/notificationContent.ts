import type { NotificationWithOrder } from './database-types'

const otherParticipantName = (notification: NotificationWithOrder): string => {
  const f = notification.friendship
  if (!f) return 'Someone'
  const otherProfile = f.requester_id === notification.recipient_id ? f.addressee_profile : f.requester_profile
  return otherProfile?.name ?? 'Someone'
}

/**
 * One sentence per event type, derived from the order or friendship
 * it's about - never stored (see NotificationWithOrder in
 * database-types.ts). The table's CHECK constraint is the exhaustive
 * list of types; a switch needs no fallback branch.
 */
export const formatNotificationText = (notification: NotificationWithOrder): string => {
  const restaurantName = notification.order?.restaurant_name ?? 'your order'

  switch (notification.type) {
    case 'order_accepted':
      return `Someone accepted your ${restaurantName} order.`
    case 'order_picked_up':
      return `Your ${restaurantName} order was picked up.`
    case 'order_out_for_delivery':
      return `Your ${restaurantName} order is out for delivery.`
    case 'order_delivered':
      return `Your ${restaurantName} order was delivered.`
    case 'order_cancelled':
      // Recipient varies by who cancelled (the other participant either
      // way - see the migration's notify_order_status_change()), so this
      // can't say "your order" the way the other order_* cases do.
      return `The ${restaurantName} order was cancelled.`
    case 'new_chat_message':
      return `New message about your ${restaurantName} order.`
    case 'friend_request_received':
      return `${otherParticipantName(notification)} sent you a friend request.`
    case 'friend_request_accepted':
      return `${otherParticipantName(notification)} accepted your friend request.`
  }
}

/** Locked per Phase 3C approval: cap the visible badge at "9+", never a large multi-digit number. */
export const formatUnreadCount = (count: number): string => (count > 9 ? '9+' : String(count))
