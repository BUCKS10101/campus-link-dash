import { describe, it, expect } from 'vitest'
import { isValidOrderStatusTransition, ORDER_STATUS_TRANSITIONS } from './orderStatus'

describe('isValidOrderStatusTransition', () => {
  it('allows the normal forward path', () => {
    expect(isValidOrderStatusTransition('pending', 'accepted')).toBe(true)
    expect(isValidOrderStatusTransition('accepted', 'picked_up')).toBe(true)
    expect(isValidOrderStatusTransition('picked_up', 'out_for_delivery')).toBe(true)
    expect(isValidOrderStatusTransition('out_for_delivery', 'delivered')).toBe(true)
  })

  it('allows cancelling from any non-terminal state', () => {
    expect(isValidOrderStatusTransition('pending', 'cancelled')).toBe(true)
    expect(isValidOrderStatusTransition('accepted', 'cancelled')).toBe(true)
    expect(isValidOrderStatusTransition('picked_up', 'cancelled')).toBe(true)
    expect(isValidOrderStatusTransition('out_for_delivery', 'cancelled')).toBe(true)
  })

  it('rejects skipping a step', () => {
    expect(isValidOrderStatusTransition('pending', 'picked_up')).toBe(false)
    expect(isValidOrderStatusTransition('pending', 'delivered')).toBe(false)
    expect(isValidOrderStatusTransition('accepted', 'delivered')).toBe(false)
  })

  it('rejects moving backwards', () => {
    expect(isValidOrderStatusTransition('accepted', 'pending')).toBe(false)
    expect(isValidOrderStatusTransition('picked_up', 'accepted')).toBe(false)
  })

  it('rejects any transition out of a terminal state', () => {
    expect(isValidOrderStatusTransition('delivered', 'pending')).toBe(false)
    expect(isValidOrderStatusTransition('delivered', 'cancelled')).toBe(false)
    expect(isValidOrderStatusTransition('cancelled', 'pending')).toBe(false)
  })

  it('rejects a no-op transition', () => {
    expect(isValidOrderStatusTransition('pending', 'pending')).toBe(false)
  })

  it('every transition target is a key that exists in the map', () => {
    for (const targets of Object.values(ORDER_STATUS_TRANSITIONS)) {
      for (const target of targets) {
        expect(ORDER_STATUS_TRANSITIONS).toHaveProperty(target)
      }
    }
  })
})
