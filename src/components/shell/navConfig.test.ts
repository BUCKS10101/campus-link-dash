import { describe, it, expect } from 'vitest'
import { isNavItemActive, NAV_ITEMS } from './navConfig'

describe('isNavItemActive', () => {
  it('matches Home only at the literal root, not as a shared prefix', () => {
    expect(isNavItemActive('/', '/')).toBe(true)
    expect(isNavItemActive('/profile', '/')).toBe(false)
    expect(isNavItemActive('/my-orders', '/')).toBe(false)
  })

  it('matches a non-root item on exact path', () => {
    expect(isNavItemActive('/profile', '/profile')).toBe(true)
    expect(isNavItemActive('/my-orders', '/my-orders')).toBe(true)
  })

  it('matches a non-root item on a sub-path', () => {
    expect(isNavItemActive('/my-orders/123', '/my-orders')).toBe(true)
  })

  it('does not cross-match unrelated routes', () => {
    expect(isNavItemActive('/post-request', '/profile')).toBe(false)
    expect(isNavItemActive('/profile', '/post-request')).toBe(false)
  })
})

describe('NAV_ITEMS', () => {
  it('defines exactly the approved IA: Home, Activity, Friends, Create, Profile', () => {
    expect(NAV_ITEMS.map((i) => i.key)).toEqual(['home', 'activity', 'friends', 'create', 'profile'])
  })

  it('does not include Chat as a top-level destination', () => {
    expect(NAV_ITEMS.some((i) => i.key === 'chat')).toBe(false)
  })

  it('points Activity at the Ordering default view, matching active-state across the whole /activity family', () => {
    const activity = NAV_ITEMS.find((i) => i.key === 'activity')
    expect(activity?.href).toBe('/activity/ordering')
    expect(activity?.matchPrefix).toBe('/activity')
    expect(isNavItemActive('/activity/delivering', activity!.matchPrefix!)).toBe(true)
    expect(isNavItemActive('/activity/ordering/history', activity!.matchPrefix!)).toBe(true)
    expect(isNavItemActive('/friends', activity!.matchPrefix!)).toBe(false)
  })

  it('includes Friends as a first-class destination, not buried inside Profile', () => {
    const friends = NAV_ITEMS.find((i) => i.key === 'friends')
    expect(friends?.href).toBe('/friends')
  })

  it('points Create at the existing Post Request route', () => {
    const create = NAV_ITEMS.find((i) => i.key === 'create')
    expect(create?.href).toBe('/post-request')
  })
})
