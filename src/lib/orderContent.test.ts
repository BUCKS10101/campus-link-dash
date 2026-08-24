import { describe, it, expect } from 'vitest'
import {
  OrderItemsSchema,
  parseOrderItemsInput,
  formatOrderItems,
  DeliveryLocationSchema,
  formatDeliveryLocation,
  getRestaurantIcon,
  FALLBACK_RESTAURANT_ICON,
} from './orderContent'

describe('OrderItemsSchema / parseOrderItemsInput / formatOrderItems', () => {
  it('parses newline-separated free text into an array of items', () => {
    expect(parseOrderItemsInput('2x Chicken Burger\n1x Large Fries\n\n2x Coke')).toEqual([
      '2x Chicken Burger',
      '1x Large Fries',
      '2x Coke',
    ])
  })

  it('rejects an empty items array', () => {
    expect(OrderItemsSchema.safeParse([]).success).toBe(false)
  })

  it('formats a valid items array for display', () => {
    expect(formatOrderItems(['2x Burger', '1x Fries'])).toBe('2x Burger, 1x Fries')
  })

  it('falls back gracefully for malformed jsonb instead of throwing', () => {
    expect(formatOrderItems(null)).toBe('Order details unavailable')
    expect(formatOrderItems({ not: 'an array' })).toBe('Order details unavailable')
    expect(formatOrderItems('legacy plain string')).toBe('legacy plain string')
  })
})

describe('DeliveryLocationSchema / formatDeliveryLocation', () => {
  it('accepts a hostel delivery location', () => {
    const result = DeliveryLocationSchema.safeParse({
      type: 'hostel',
      label: "Men's Hostel K",
      hostelType: 'mens',
      block: 'K',
    })
    expect(result.success).toBe(true)
  })

  it('accepts a campus delivery location without hostel fields', () => {
    expect(DeliveryLocationSchema.safeParse({ type: 'campus', label: 'TT Block' }).success).toBe(true)
  })

  it('rejects a missing label', () => {
    expect(DeliveryLocationSchema.safeParse({ type: 'campus', label: '' }).success).toBe(false)
  })

  it('formats a valid location down to its label', () => {
    expect(formatDeliveryLocation({ type: 'campus', label: 'TT Block' })).toBe('TT Block')
  })

  it('falls back gracefully for malformed jsonb instead of throwing', () => {
    expect(formatDeliveryLocation(null)).toBe('Location unavailable')
    expect(formatDeliveryLocation('legacy plain string')).toBe('legacy plain string')
  })
})

describe('getRestaurantIcon', () => {
  it('returns the known icon for a recognized restaurant', () => {
    expect(getRestaurantIcon('One Food')).toBe('🍔')
  })

  it('falls back to a generic icon for an unrecognized restaurant', () => {
    expect(getRestaurantIcon('Some New Place')).toBe(FALLBACK_RESTAURANT_ICON)
  })
})
