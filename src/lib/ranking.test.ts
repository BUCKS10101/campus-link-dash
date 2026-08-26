import { describe, it, expect } from 'vitest'
import {
  getTrustTier,
  hasUsableDistance,
  rewardDensity,
  rankQuickErrands,
  rankHighReward,
  rankFeatured,
  rankRecommended,
  MIN_DISTANCE_KM,
  filterByLocation,
  matchesLocationFilter,
  isLocationFilterActive,
  type RankableOrder,
  type RecommendableOrder,
  type ReputationSummary,
  type LocationFilterableOrder,
} from './ranking'

const order = (overrides: Partial<RankableOrder> & { id: string }): RankableOrder => ({
  tip_amount: 30,
  distance_km: 1,
  distance_source: 'routed',
  created_at: '2026-08-26T12:00:00Z',
  ...overrides,
})

const recommendableOrder = (overrides: Partial<RecommendableOrder> & { id: string }): RecommendableOrder => ({
  requester_id: 'requester-1',
  tip_amount: 30,
  distance_km: 1,
  distance_source: 'routed',
  created_at: '2026-08-26T12:00:00Z',
  ...overrides,
})

describe('getTrustTier', () => {
  it('is routed only when distance_source is routed AND a distance exists', () => {
    expect(getTrustTier(order({ id: '1', distance_source: 'routed', distance_km: 0.5 }))).toBe('routed')
  })

  it('is fallback when distance_source is fallback and a distance exists', () => {
    expect(getTrustTier(order({ id: '1', distance_source: 'fallback', distance_km: 0.5 }))).toBe('fallback')
  })

  it('is unresolved when distance_source is null (legacy order)', () => {
    expect(getTrustTier(order({ id: '1', distance_source: null, distance_km: null }))).toBe('unresolved')
  })

  it('is unresolved when distance_km is null even if distance_source claims routed', () => {
    // Shouldn't happen from real data, but the function must not trust a
    // tier label with no number behind it.
    expect(getTrustTier(order({ id: '1', distance_source: 'routed', distance_km: null }))).toBe('unresolved')
  })

  it('is unresolved for the explicit "unresolved" distance_source', () => {
    expect(getTrustTier(order({ id: '1', distance_source: 'unresolved', distance_km: null }))).toBe('unresolved')
  })
})

describe('hasUsableDistance', () => {
  it('is true for routed and fallback, false for unresolved', () => {
    expect(hasUsableDistance(order({ id: '1', distance_source: 'routed', distance_km: 1 }))).toBe(true)
    expect(hasUsableDistance(order({ id: '1', distance_source: 'fallback', distance_km: 1 }))).toBe(true)
    expect(hasUsableDistance(order({ id: '1', distance_source: null, distance_km: null }))).toBe(false)
  })
})

describe('rewardDensity', () => {
  it('divides tip by distance for a usable-distance order', () => {
    expect(rewardDensity(order({ id: '1', tip_amount: 40, distance_km: 2 }))).toBe(20)
  })

  it('is null for an unresolved order - never fabricates a ratio', () => {
    expect(rewardDensity(order({ id: '1', distance_source: null, distance_km: null }))).toBeNull()
  })

  it('floors the denominator at MIN_DISTANCE_KM for a very short/near-zero trip', () => {
    const veryClose = order({ id: '1', tip_amount: 30, distance_km: 0.001 })
    expect(rewardDensity(veryClose)).toBe(30 / MIN_DISTANCE_KM)
    // Confirms the floor actually caps it - without it this would be 30000.
    expect(rewardDensity(veryClose)).toBeLessThan(1000)
  })

  it('is unaffected by the floor once distance exceeds it', () => {
    expect(rewardDensity(order({ id: '1', tip_amount: 30, distance_km: 1 }))).toBe(30)
  })
})

describe('rankQuickErrands', () => {
  it('sorts usable-distance orders by distance ascending', () => {
    const far = order({ id: 'far', distance_km: 2 })
    const near = order({ id: 'near', distance_km: 0.3 })
    const mid = order({ id: 'mid', distance_km: 1 })
    expect(rankQuickErrands([far, near, mid]).map((o) => o.id)).toEqual(['near', 'mid', 'far'])
  })

  it('never includes unresolved orders', () => {
    const routed = order({ id: 'routed', distance_km: 1 })
    const legacy = order({ id: 'legacy', distance_source: null, distance_km: null })
    const result = rankQuickErrands([routed, legacy])
    expect(result.map((o) => o.id)).toEqual(['routed'])
  })

  it('includes both routed and fallback orders, ranked purely by distance', () => {
    const routedFar = order({ id: 'routed-far', distance_source: 'routed', distance_km: 1.5 })
    const fallbackNear = order({ id: 'fallback-near', distance_source: 'fallback', distance_km: 0.4 })
    expect(rankQuickErrands([routedFar, fallbackNear]).map((o) => o.id)).toEqual(['fallback-near', 'routed-far'])
  })

  it('breaks a distance tie by most recent first', () => {
    const older = order({ id: 'older', distance_km: 1, created_at: '2026-08-26T10:00:00Z' })
    const newer = order({ id: 'newer', distance_km: 1, created_at: '2026-08-26T11:00:00Z' })
    expect(rankQuickErrands([older, newer]).map((o) => o.id)).toEqual(['newer', 'older'])
  })

  it('returns an empty list when nothing on the board has a usable distance', () => {
    const legacy1 = order({ id: 'a', distance_source: null, distance_km: null })
    const legacy2 = order({ id: 'b', distance_source: 'unresolved', distance_km: null })
    expect(rankQuickErrands([legacy1, legacy2])).toEqual([])
  })
})

describe('rankHighReward', () => {
  it('ranks usable-distance orders by reward_density, not raw tip', () => {
    // Higher tip but much farther - lower density, should rank second.
    const bigTipFar = order({ id: 'big-tip-far', tip_amount: 100, distance_km: 5 }) // density 20
    const smallTipNear = order({ id: 'small-tip-near', tip_amount: 30, distance_km: 0.5 }) // density 60
    expect(rankHighReward([bigTipFar, smallTipNear]).map((o) => o.id)).toEqual(['small-tip-near', 'big-tip-far'])
  })

  it('places unresolved orders after every usable-distance order, ranked by tip alone', () => {
    const routed = order({ id: 'routed', tip_amount: 10, distance_km: 5 }) // density 2 - very low
    const legacyHighTip = order({ id: 'legacy-high-tip', distance_source: null, distance_km: null, tip_amount: 90 })
    const legacyLowTip = order({ id: 'legacy-low-tip', distance_source: null, distance_km: null, tip_amount: 20 })
    const result = rankHighReward([legacyLowTip, routed, legacyHighTip])
    // routed (has real density) must lead even though its tip is tiny -
    // tiers are never blended - then unresolved ordered by tip within
    // their own group.
    expect(result.map((o) => o.id)).toEqual(['routed', 'legacy-high-tip', 'legacy-low-tip'])
  })

  it('breaks a density tie by most recent first', () => {
    const older = order({ id: 'older', tip_amount: 30, distance_km: 1, created_at: '2026-08-26T10:00:00Z' })
    const newer = order({ id: 'newer', tip_amount: 30, distance_km: 1, created_at: '2026-08-26T11:00:00Z' })
    expect(rankHighReward([older, newer]).map((o) => o.id)).toEqual(['newer', 'older'])
  })

  it('breaks an unresolved tip tie by most recent first', () => {
    const older = order({ id: 'older', distance_source: null, distance_km: null, tip_amount: 30, created_at: '2026-08-26T10:00:00Z' })
    const newer = order({ id: 'newer', distance_source: null, distance_km: null, tip_amount: 30, created_at: '2026-08-26T11:00:00Z' })
    expect(rankHighReward([older, newer]).map((o) => o.id)).toEqual(['newer', 'older'])
  })
})

describe('rankFeatured', () => {
  it('picks the best reward_density order when any exists', () => {
    const routed = order({ id: 'routed', tip_amount: 30, distance_km: 0.5 }) // density 60
    const legacyHighTip = order({ id: 'legacy', distance_source: null, distance_km: null, tip_amount: 200 })
    expect(rankFeatured([legacyHighTip, routed])?.id).toBe('routed')
  })

  it('falls back to highest tip when nothing on the board has a usable distance', () => {
    const legacyLow = order({ id: 'low', distance_source: null, distance_km: null, tip_amount: 20 })
    const legacyHigh = order({ id: 'high', distance_source: null, distance_km: null, tip_amount: 50 })
    expect(rankFeatured([legacyLow, legacyHigh])?.id).toBe('high')
  })

  it('is null for an empty board', () => {
    expect(rankFeatured([])).toBeNull()
  })
})

const BALAJI = 'balaji-store-id'
const TT = 'tt-id'
const SJT = 'sjt-id'

const locOrder = (overrides: Partial<LocationFilterableOrder> & { id: string }): LocationFilterableOrder => ({
  pickup_point_id: null,
  delivery_point_id: null,
  ...overrides,
})

describe('isLocationFilterActive / matchesLocationFilter', () => {
  it('is inactive when both sides are null', () => {
    expect(isLocationFilterActive({ pickupPointId: null, deliveryPointId: null })).toBe(false)
  })

  it('is active when either side is set', () => {
    expect(isLocationFilterActive({ pickupPointId: BALAJI, deliveryPointId: null })).toBe(true)
    expect(isLocationFilterActive({ pickupPointId: null, deliveryPointId: TT })).toBe(true)
  })

  it('an order with no pickup/delivery point can never match a specific filter', () => {
    const legacy = locOrder({ id: 'legacy' })
    expect(matchesLocationFilter(legacy, { pickupPointId: BALAJI, deliveryPointId: null })).toBe(false)
    expect(matchesLocationFilter(legacy, { pickupPointId: null, deliveryPointId: TT })).toBe(false)
  })

  it('matches when no filter is set at all, regardless of the order', () => {
    const legacy = locOrder({ id: 'legacy' })
    const resolved = locOrder({ id: 'resolved', pickup_point_id: BALAJI, delivery_point_id: TT })
    const filter = { pickupPointId: null, deliveryPointId: null }
    expect(matchesLocationFilter(legacy, filter)).toBe(true)
    expect(matchesLocationFilter(resolved, filter)).toBe(true)
  })
})

describe('filterByLocation', () => {
  const balajiToTT = locOrder({ id: 'balaji-tt', pickup_point_id: BALAJI, delivery_point_id: TT })
  const balajiToSjt = locOrder({ id: 'balaji-sjt', pickup_point_id: BALAJI, delivery_point_id: SJT })
  const sjtToTT = locOrder({ id: 'sjt-tt', pickup_point_id: SJT, delivery_point_id: TT })
  const legacy = locOrder({ id: 'legacy' })
  const board = [balajiToTT, balajiToSjt, sjtToTT, legacy]

  it('From only: shows every order picked up at that point', () => {
    const result = filterByLocation(board, { pickupPointId: BALAJI, deliveryPointId: null })
    expect(result.map((o) => o.id).sort()).toEqual(['balaji-sjt', 'balaji-tt'])
  })

  it('To only: shows every order going to that point', () => {
    const result = filterByLocation(board, { pickupPointId: null, deliveryPointId: TT })
    expect(result.map((o) => o.id).sort()).toEqual(['balaji-tt', 'sjt-tt'])
  })

  it('From + To: shows only the exact pickup-to-delivery pair', () => {
    const result = filterByLocation(board, { pickupPointId: BALAJI, deliveryPointId: TT })
    expect(result.map((o) => o.id)).toEqual(['balaji-tt'])
  })

  it('clearing the filter (both null) returns every order, including legacy/unresolved ones', () => {
    const result = filterByLocation(board, { pickupPointId: null, deliveryPointId: null })
    expect(result.map((o) => o.id).sort()).toEqual(['balaji-sjt', 'balaji-tt', 'legacy', 'sjt-tt'])
  })

  it('a legacy/unresolved order (no pickup/delivery point) never matches a specific From/To filter', () => {
    expect(filterByLocation(board, { pickupPointId: BALAJI, deliveryPointId: null }).some((o) => o.id === 'legacy')).toBe(false)
    expect(filterByLocation(board, { pickupPointId: null, deliveryPointId: TT }).some((o) => o.id === 'legacy')).toBe(false)
    expect(filterByLocation(board, { pickupPointId: BALAJI, deliveryPointId: TT }).some((o) => o.id === 'legacy')).toBe(false)
  })
})

describe('rankRecommended', () => {
  const VIEWER = 'viewer-1'
  const noFriends = new Set<string>()
  const noReputation = new Map<string, ReputationSummary>()

  it('is deterministic - the same input always produces the same output', () => {
    const orders = [
      recommendableOrder({ id: 'a', requester_id: 'r1', tip_amount: 30, distance_km: 2, distance_source: 'routed' }),
      recommendableOrder({ id: 'b', requester_id: 'r2', tip_amount: 10, distance_km: 1, distance_source: 'fallback' }),
      recommendableOrder({ id: 'c', requester_id: 'r3', tip_amount: 500, distance_km: null, distance_source: null }),
    ]
    const first = rankRecommended(orders, VIEWER, noFriends, noReputation).map((o) => o.id)
    const second = rankRecommended(orders, VIEWER, noFriends, noReputation).map((o) => o.id)
    expect(first).toEqual(second)
  })

  it('excludes the viewer\'s own posted orders, even when they would otherwise rank first', () => {
    const orders = [
      recommendableOrder({ id: 'mine', requester_id: VIEWER, tip_amount: 1000, distance_km: 0.1, distance_source: 'routed' }),
      recommendableOrder({ id: 'theirs', requester_id: 'someone-else', tip_amount: 1, distance_km: 5, distance_source: 'fallback' }),
    ]
    const result = rankRecommended(orders, VIEWER, noFriends, noReputation)
    expect(result.map((o) => o.id)).toEqual(['theirs'])
  })

  it('routed outranks fallback regardless of reward', () => {
    const orders = [
      recommendableOrder({ id: 'fallback-high-reward', requester_id: 'r1', tip_amount: 1000, distance_km: 1, distance_source: 'fallback' }),
      recommendableOrder({ id: 'routed-low-reward', requester_id: 'r2', tip_amount: 1, distance_km: 1, distance_source: 'routed' }),
    ]
    const result = rankRecommended(orders, VIEWER, noFriends, noReputation)
    expect(result.map((o) => o.id)).toEqual(['routed-low-reward', 'fallback-high-reward'])
  })

  it('fallback outranks unresolved regardless of reward', () => {
    const orders = [
      recommendableOrder({ id: 'unresolved-high-reward', requester_id: 'r1', tip_amount: 1000, distance_km: null, distance_source: null }),
      recommendableOrder({ id: 'fallback-low-reward', requester_id: 'r2', tip_amount: 1, distance_km: 1, distance_source: 'fallback' }),
    ]
    const result = rankRecommended(orders, VIEWER, noFriends, noReputation)
    expect(result.map((o) => o.id)).toEqual(['fallback-low-reward', 'unresolved-high-reward'])
  })

  it('within the same tier, orders by reward density (routed/fallback) or raw tip (unresolved)', () => {
    const routed = [
      recommendableOrder({ id: 'low-density', requester_id: 'r1', tip_amount: 10, distance_km: 10, distance_source: 'routed' }),
      recommendableOrder({ id: 'high-density', requester_id: 'r2', tip_amount: 100, distance_km: 1, distance_source: 'routed' }),
    ]
    expect(rankRecommended(routed, VIEWER, noFriends, noReputation).map((o) => o.id)).toEqual(['high-density', 'low-density'])

    const unresolved = [
      recommendableOrder({ id: 'low-tip', requester_id: 'r1', tip_amount: 5, distance_km: null, distance_source: null }),
      recommendableOrder({ id: 'high-tip', requester_id: 'r2', tip_amount: 50, distance_km: null, distance_source: null }),
    ]
    expect(rankRecommended(unresolved, VIEWER, noFriends, noReputation).map((o) => o.id)).toEqual(['high-tip', 'low-tip'])
  })

  it('reputation only breaks a tie between orders already equal on tier + reward density (both sides rated)', () => {
    const orders = [
      recommendableOrder({ id: 'from-lower-rated', requester_id: 'lower-rated', tip_amount: 30, distance_km: 3, distance_source: 'routed', created_at: '2026-08-26T09:00:00Z' }),
      recommendableOrder({ id: 'from-higher-rated', requester_id: 'higher-rated', tip_amount: 30, distance_km: 3, distance_source: 'routed', created_at: '2026-08-26T08:00:00Z' }),
    ]
    const reputation = new Map<string, ReputationSummary>([
      ['higher-rated', { avg_rating: 4.9, rating_count: 10 }],
      ['lower-rated', { avg_rating: 3.5, rating_count: 5 }],
    ])
    const result = rankRecommended(orders, VIEWER, noFriends, reputation)
    // Higher-rated wins the tie despite being the older/less-recent post -
    // proves reputation actually decides when both sides have real ratings.
    expect(result.map((o) => o.id)).toEqual(['from-higher-rated', 'from-lower-rated'])
  })

  it('never lets a real rated requester\'s order outrank a genuinely better-value order from an unrated requester', () => {
    const orders = [
      recommendableOrder({ id: 'better-value-unrated', requester_id: 'unrated', tip_amount: 100, distance_km: 1, distance_source: 'routed' }),
      recommendableOrder({ id: 'worse-value-rated', requester_id: 'rated', tip_amount: 10, distance_km: 10, distance_source: 'routed' }),
    ]
    const reputation = new Map<string, ReputationSummary>([
      ['rated', { avg_rating: 5, rating_count: 20 }],
      ['unrated', { avg_rating: null, rating_count: 0 }],
    ])
    const result = rankRecommended(orders, VIEWER, noFriends, reputation)
    expect(result.map((o) => o.id)).toEqual(['better-value-unrated', 'worse-value-rated'])
  })

  it('two orders differing only in one side being unrated stay tied at the reputation level and fall through', () => {
    const orders = [
      recommendableOrder({ id: 'newer-unrated', requester_id: 'unrated', tip_amount: 30, distance_km: 3, distance_source: 'routed', created_at: '2026-08-26T10:00:00Z' }),
      recommendableOrder({ id: 'older-unrated-too', requester_id: 'also-unrated', tip_amount: 30, distance_km: 3, distance_source: 'routed', created_at: '2026-08-26T09:00:00Z' }),
    ]
    const reputation = new Map<string, ReputationSummary>([
      ['unrated', { avg_rating: null, rating_count: 0 }],
      ['also-unrated', { avg_rating: null, rating_count: 0 }],
    ])
    // Reputation yields no difference for either side (both unrated) -
    // falls through to recency: the newer one wins.
    const result = rankRecommended(orders, VIEWER, noFriends, reputation)
    expect(result.map((o) => o.id)).toEqual(['newer-unrated', 'older-unrated-too'])
  })

  it('friendship only breaks a tie between orders already equal through reputation, never overriding reward', () => {
    const orders = [
      recommendableOrder({ id: 'from-friend', requester_id: 'friend-1', tip_amount: 30, distance_km: 3, distance_source: 'routed', created_at: '2026-08-25T10:00:00Z' }),
      recommendableOrder({ id: 'from-stranger', requester_id: 'stranger-1', tip_amount: 30, distance_km: 3, distance_source: 'routed', created_at: '2026-08-26T10:00:00Z' }),
    ]
    const friends = new Set(['friend-1'])
    const result = rankRecommended(orders, VIEWER, friends, noReputation)
    expect(result.map((o) => o.id)).toEqual(['from-friend', 'from-stranger'])
  })

  it('friendship never overrides a meaningfully better reward density', () => {
    const orders = [
      recommendableOrder({ id: 'friend-low-value', requester_id: 'friend-1', tip_amount: 5, distance_km: 10, distance_source: 'routed' }),
      recommendableOrder({ id: 'stranger-high-value', requester_id: 'stranger-1', tip_amount: 100, distance_km: 1, distance_source: 'routed' }),
    ]
    const friends = new Set(['friend-1'])
    const result = rankRecommended(orders, VIEWER, friends, noReputation)
    expect(result.map((o) => o.id)).toEqual(['stranger-high-value', 'friend-low-value'])
  })

  it('recency breaks a final tie when tier, reward, reputation, and friendship are all equal', () => {
    const orders = [
      recommendableOrder({ id: 'older', requester_id: 'r1', tip_amount: 30, distance_km: 3, distance_source: 'routed', created_at: '2026-08-25T10:00:00Z' }),
      recommendableOrder({ id: 'newer', requester_id: 'r2', tip_amount: 30, distance_km: 3, distance_source: 'routed', created_at: '2026-08-26T10:00:00Z' }),
    ]
    const result = rankRecommended(orders, VIEWER, noFriends, noReputation)
    expect(result.map((o) => o.id)).toEqual(['newer', 'older'])
  })

  it('handles a legacy unresolved order (distance_source null, distance_km null) without crashing', () => {
    const orders = [
      recommendableOrder({ id: 'legacy', requester_id: 'r1', tip_amount: 999, distance_km: null, distance_source: null }),
    ]
    expect(() => rankRecommended(orders, VIEWER, noFriends, noReputation)).not.toThrow()
    expect(rankRecommended(orders, VIEWER, noFriends, noReputation).map((o) => o.id)).toEqual(['legacy'])
  })
})
