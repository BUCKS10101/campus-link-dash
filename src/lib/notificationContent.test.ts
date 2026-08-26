import { describe, it, expect } from 'vitest'
import { formatNotificationText, formatUnreadCount } from './notificationContent'
import type { NotificationWithOrder } from './database-types'

const orderNotification = (type: NotificationWithOrder['type'], restaurantName: string): NotificationWithOrder => ({
  id: 'n1',
  recipient_id: 'me',
  type,
  order_id: 'order-1',
  friendship_id: null,
  read_at: null,
  created_at: new Date().toISOString(),
  order: { restaurant_name: restaurantName },
  friendship: null,
})

const friendNotification = (
  type: 'friend_request_received' | 'friend_request_accepted',
  recipientId: string,
  requesterId: string,
  addresseeId: string,
  requesterName: string,
  addresseeName: string,
): NotificationWithOrder => ({
  id: 'n1',
  recipient_id: recipientId,
  type,
  order_id: null,
  friendship_id: 'friendship-1',
  read_at: null,
  created_at: new Date().toISOString(),
  order: null,
  friendship: {
    requester_id: requesterId,
    addressee_id: addresseeId,
    requester_profile: { name: requesterName },
    addressee_profile: { name: addresseeName },
  },
})

describe('formatNotificationText - order/chat notifications', () => {
  it('derives one sentence per lifecycle event from the order it is about', () => {
    expect(formatNotificationText(orderNotification('order_accepted', 'One Food World'))).toBe(
      'Someone accepted your One Food World order.',
    )
    expect(formatNotificationText(orderNotification('order_picked_up', 'One Food World'))).toBe(
      'Your One Food World order was picked up.',
    )
    expect(formatNotificationText(orderNotification('order_out_for_delivery', 'One Food World'))).toBe(
      'Your One Food World order is out for delivery.',
    )
    expect(formatNotificationText(orderNotification('order_delivered', 'One Food World'))).toBe(
      'Your One Food World order was delivered.',
    )
  })

  it('derives chat notification text the same way, from the same order', () => {
    expect(formatNotificationText(orderNotification('new_chat_message', 'DC Cafe'))).toBe(
      'New message about your DC Cafe order.',
    )
  })
})

describe('formatNotificationText - friend request notifications (Phase 3E)', () => {
  it('names the sender for a received request, not the recipient themselves', () => {
    const n = friendNotification('friend_request_received', 'me', 'requester-1', 'me', 'Alice', 'Me')
    expect(formatNotificationText(n)).toBe('Alice sent you a friend request.')
  })

  it('names the acceptER for an accepted notification, sent to the original requester', () => {
    // recipient is the original requester ("me"); the OTHER participant
    // (the addressee, who just accepted) is the name that should appear.
    const n = friendNotification('friend_request_accepted', 'me', 'me', 'addressee-1', 'Me', 'Bob')
    expect(formatNotificationText(n)).toBe('Bob accepted your friend request.')
  })

  it('falls back to a neutral name if the friendship/profile embed is missing', () => {
    const n: NotificationWithOrder = {
      id: 'n1', recipient_id: 'me', type: 'friend_request_received', order_id: null,
      friendship_id: 'friendship-1', read_at: null, created_at: new Date().toISOString(),
      order: null, friendship: null,
    }
    expect(formatNotificationText(n)).toBe('Someone sent you a friend request.')
  })
})

describe('formatUnreadCount', () => {
  it('shows the exact count up to 9', () => {
    expect(formatUnreadCount(0)).toBe('0')
    expect(formatUnreadCount(1)).toBe('1')
    expect(formatUnreadCount(9)).toBe('9')
  })

  it('caps anything above 9 at "9+", never a large multi-digit number', () => {
    expect(formatUnreadCount(10)).toBe('9+')
    expect(formatUnreadCount(42)).toBe('9+')
    expect(formatUnreadCount(999)).toBe('9+')
  })
})
