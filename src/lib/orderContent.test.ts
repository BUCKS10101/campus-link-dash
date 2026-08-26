import { describe, it, expect } from 'vitest'
import {
  OrderItemsSchema,
  parseOrderItemsInput,
  formatOrderItems,
  DeliveryLocationSchema,
  formatDeliveryLocation,
  getRestaurantIcon,
  FALLBACK_RESTAURANT_ICON,
  formatRouteEstimate,
  formatOrderDistance,
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

describe('formatRouteEstimate', () => {
  it('labels a real routed geometry as a walking estimate with ETA', () => {
    const routed = {
      distanceKm: 0.104695405554211,
      etaMinutes: 1.3,
      geometry: { type: 'LineString', coordinates: [[79.16, 12.97], [79.161, 12.971]] },
    }
    expect(formatRouteEstimate(routed)).toBe('0.1 km · ~1 min walk')
  })

  it('never labels a null-geometry fallback as a walk - straight-line distance estimate only', () => {
    const fallback = {
      distanceKm: 0.291310733330948,
      etaMinutes: 3.5,
      geometry: null,
    }
    const result = formatRouteEstimate(fallback)
    expect(result).toBe('~0.3 km · distance estimate')
    expect(result).not.toContain('walk')
  })

  it('supports a different decimal precision (MyOrders uses 2)', () => {
    const routed = { distanceKm: 0.104695405554211, etaMinutes: 1.3, geometry: { type: 'LineString', coordinates: [] } }
    expect(formatRouteEstimate(routed, 2)).toBe('0.10 km · ~1 min walk')

    const fallback = { distanceKm: 0.291310733330948, etaMinutes: 3.5, geometry: null }
    expect(formatRouteEstimate(fallback, 2)).toBe('~0.29 km · distance estimate')
  })
})

describe('formatOrderDistance', () => {
  it('labels a routed order as a walking estimate, recomputing ETA from the same 5 km/h constant', () => {
    // 1.0 km / 5 km/h * 60 = 12 min.
    expect(formatOrderDistance({ distance_km: 1, distance_source: 'routed' })).toBe('1.0 km · ~12 min walk')
  })

  it('never labels a fallback order as a walk', () => {
    const result = formatOrderDistance({ distance_km: 0.42, distance_source: 'fallback' })
    expect(result).toBe('~0.4 km · distance estimate')
    expect(result).not.toContain('walk')
  })

  it('treats a legacy/unresolved order with no distance_source the same as fallback if a number exists', () => {
    // Shouldn't happen from the real creation flow (unresolved implies no
    // distance_km either), but must never claim a walk it can't back.
    const result = formatOrderDistance({ distance_km: 0.42, distance_source: null })
    expect(result).not.toContain('walk')
  })

  it('returns null (no distance claim at all) when distance_km is null', () => {
    expect(formatOrderDistance({ distance_km: null, distance_source: null })).toBeNull()
    expect(formatOrderDistance({ distance_km: null, distance_source: 'unresolved' })).toBeNull()
  })
})
