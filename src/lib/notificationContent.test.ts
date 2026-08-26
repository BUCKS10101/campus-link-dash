import { describe, it, expect } from 'vitest'
import { formatNotificationText, formatUnreadCount } from './notificationContent'

describe('formatNotificationText', () => {
  it('derives one sentence per lifecycle event from the order it is about', () => {
    expect(formatNotificationText('order_accepted', 'One Food World')).toBe(
      'Someone accepted your One Food World order.',
    )
    expect(formatNotificationText('order_picked_up', 'One Food World')).toBe(
      'Your One Food World order was picked up.',
    )
    expect(formatNotificationText('order_out_for_delivery', 'One Food World')).toBe(
      'Your One Food World order is out for delivery.',
    )
    expect(formatNotificationText('order_delivered', 'One Food World')).toBe(
      'Your One Food World order was delivered.',
    )
  })

  it('derives chat notification text the same way, from the same order', () => {
    expect(formatNotificationText('new_chat_message', 'DC Cafe')).toBe(
      'New message about your DC Cafe order.',
    )
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
