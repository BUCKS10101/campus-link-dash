/**
 * Phase 3B — deterministic, explainable opportunity ranking. No AI/ML, no
 * opaque global score. See PHASE3_3B_NEARBY_DISCOVERY_SPEC.md §6 for the
 * full rationale behind every decision below.
 *
 * Trust tiers are never blended into one number - a tier is decided
 * first (routed > fallback > unresolved), and only orders within the
 * same tier are ever compared to each other by a ratio.
 */

export type TrustTier = 'routed' | 'fallback' | 'unresolved'

export interface RankableOrder {
  id: string
  tip_amount: number
  distance_km: number | null
  distance_source: TrustTier | null
  created_at: string
}

/**
 * Numerical floor for reward_density's denominator only - 3A's own data
 * already contains trips a few meters apart (e.g. adjacent hostel
 * blocks); without a floor, a trivial hop produces an arbitrarily huge
 * ratio and would dominate the board for the wrong reason. This is the
 * one tunable constant in the whole model, and it exists purely for
 * numerical stability, not as a weight.
 */
export const MIN_DISTANCE_KM = 0.05

/**
 * distance_source is the source of truth (set once at creation time -
 * see the orders.distance_source migration). distance_km == null is
 * treated as unresolved regardless of what distance_source says, since a
 * tier without a real number to back it isn't usable for anything.
 */
export const getTrustTier = (order: RankableOrder): TrustTier => {
  if (order.distance_km == null) return 'unresolved'
  if (order.distance_source === 'routed') return 'routed'
  if (order.distance_source === 'fallback') return 'fallback'
  return 'unresolved'
}

export const hasUsableDistance = (order: RankableOrder): boolean => {
  const tier = getTrustTier(order)
  return tier === 'routed' || tier === 'fallback'
}

/**
 * tip per km of the trip itself - chosen over a weighted sum of
 * normalized distance/tip because a weighted sum requires picking
 * arbitrary weights, which the product spec explicitly rules out. This
 * is a single, dimensionally meaningful number: how much you're paid for
 * how far you'd walk. null whenever there's no usable distance to divide
 * by - never fabricated.
 */
export const rewardDensity = (order: RankableOrder): number | null => {
  if (!hasUsableDistance(order) || order.distance_km == null) return null
  return order.tip_amount / Math.max(order.distance_km, MIN_DISTANCE_KM)
}

const byRecencyDesc = (a: RankableOrder, b: RankableOrder): number =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime()

/**
 * "Quick errands" - shortest real/fallback distance first. Unresolved
 * orders are never included here (there's no distance to call "quick"),
 * per explicit product decision - they aren't hidden from the app, just
 * never labeled as a short errand when nothing backs that claim.
 */
export const rankQuickErrands = <T extends RankableOrder>(orders: readonly T[]): T[] =>
  orders
    .filter(hasUsableDistance)
    .slice()
    .sort((a, b) => {
      // hasUsableDistance guarantees distance_km is non-null here.
      const diff = (a.distance_km as number) - (b.distance_km as number)
      return diff !== 0 ? diff : byRecencyDesc(a, b)
    })

/**
 * "High reward" - highest reward_density first, for orders where it's
 * computable. Unresolved orders are never excluded from the app or from
 * this list entirely (they "remain visible and usable" per product
 * decision) - they're ranked by their one available real signal, raw
 * tip_amount, and appended after every order with a real reward_density.
 * This is two clearly-explainable groups concatenated, never a blended
 * score mixing a per-km ratio with a plain rupee amount.
 */
export const rankHighReward = <T extends RankableOrder>(orders: readonly T[]): T[] => {
  const withDistance = orders
    .filter(hasUsableDistance)
    .slice()
    .sort((a, b) => {
      const diff = (rewardDensity(b) as number) - (rewardDensity(a) as number)
      return diff !== 0 ? diff : byRecencyDesc(a, b)
    })

  const withoutDistance = orders
    .filter((o) => !hasUsableDistance(o))
    .slice()
    .sort((a, b) => {
      const diff = b.tip_amount - a.tip_amount
      return diff !== 0 ? diff : byRecencyDesc(a, b)
    })

  return [...withDistance, ...withoutDistance]
}

/**
 * The single dominant "Best on the board" opportunity - reuses
 * rankHighReward's ordering (best reward_density, or best tip when
 * nothing on the board has a usable distance yet), rather than a
 * separate rule, so there is exactly one definition of "best" in the
 * whole app.
 */
export const rankFeatured = <T extends RankableOrder>(orders: readonly T[]): T | null =>
  rankHighReward(orders)[0] ?? null

/**
 * Phase 3F — "Recommended for you". A strict lexicographic hierarchy,
 * never a weighted sum: each level below only ever breaks a tie left by
 * the level above it. See PHASE3_3F_SMART_MATCHING_SPEC.md §4.
 *
 * Reuses getTrustTier/hasUsableDistance/rewardDensity verbatim - there
 * is exactly one definition of tier/reward in this app, and this
 * function does not duplicate or reinterpret it.
 */
export interface RecommendableOrder extends RankableOrder {
  requester_id: string
}

/** Aggregate reputation shape from get_profile(s)_reputation - see useRatings.ts. */
export interface ReputationSummary {
  avg_rating: number | null
  rating_count: number
}

const TIER_RANK: Record<TrustTier, number> = { routed: 0, fallback: 1, unresolved: 2 }

const compareTier = (a: RankableOrder, b: RankableOrder): number =>
  TIER_RANK[getTrustTier(a)] - TIER_RANK[getTrustTier(b)]

/**
 * Only ever called once both orders are already known to share a tier
 * (compareTier returned 0) - so hasUsableDistance(a) === hasUsableDistance(b)
 * here, and the same two-shape treatment rankHighReward already uses
 * (reward_density for a usable distance, raw tip otherwise) applies.
 */
const compareRewardWithinTier = (a: RankableOrder, b: RankableOrder): number => {
  if (hasUsableDistance(a)) {
    return (rewardDensity(b) as number) - (rewardDensity(a) as number)
  }
  return b.tip_amount - a.tip_amount
}

/**
 * Reputation only ever decides between two orders already tied through
 * tier + reward - never a filter, never applied when either requester
 * has zero ratings (an unrated user is neither boosted nor penalized;
 * this level simply yields no difference and falls through). See spec §6.
 */
const compareReputation = (
  a: RecommendableOrder,
  b: RecommendableOrder,
  reputationByRequesterId: ReadonlyMap<string, ReputationSummary>,
): number => {
  const ra = reputationByRequesterId.get(a.requester_id)
  const rb = reputationByRequesterId.get(b.requester_id)
  if (!ra || !rb || ra.rating_count === 0 || rb.rating_count === 0) return 0
  return (rb.avg_rating ?? 0) - (ra.avg_rating ?? 0)
}

/**
 * Friendship only ever decides between two orders already tied through
 * tier + reward + reputation - a same-tier, same-reward, same-trust nudge,
 * never a boost large enough to move an order past a meaningfully
 * better one. See spec §7. deliverer_id is always null on the public
 * pending board, so only requester_id is ever meaningful here.
 */
const compareFriendship = (
  a: RecommendableOrder,
  b: RecommendableOrder,
  friendIds: ReadonlySet<string>,
): number => {
  const aFriend = friendIds.has(a.requester_id) ? 1 : 0
  const bFriend = friendIds.has(b.requester_id) ? 1 : 0
  return bFriend - aFriend
}

/**
 * Eligibility (Recommended-view only, spec §2): the viewer's own posted
 * orders are excluded here, not from the underlying board query -
 * All/Quick errands/High reward are untouched and still show them.
 */
export const rankRecommended = <T extends RecommendableOrder>(
  orders: readonly T[],
  viewerId: string,
  friendIds: ReadonlySet<string>,
  reputationByRequesterId: ReadonlyMap<string, ReputationSummary>,
): T[] =>
  orders
    .filter((o) => o.requester_id !== viewerId)
    .slice()
    .sort((a, b) => {
      const tierDiff = compareTier(a, b)
      if (tierDiff !== 0) return tierDiff
      const rewardDiff = compareRewardWithinTier(a, b)
      if (rewardDiff !== 0) return rewardDiff
      const reputationDiff = compareReputation(a, b, reputationByRequesterId)
      if (reputationDiff !== 0) return reputationDiff
      const friendshipDiff = compareFriendship(a, b, friendIds)
      if (friendshipDiff !== 0) return friendshipDiff
      return byRecencyDesc(a, b)
    })

/**
 * Where (3B follow-up) — filter by pickup/delivery campus_points.id,
 * using data every order already carries (pickup_point_id/
 * delivery_point_id) - no schema change, no per-order lookup.
 *
 * A null side of the filter means "don't constrain that side" - not
 * "match orders with no point set". An order whose own
 * pickup_point_id/delivery_point_id is null (legacy/custom-pin/
 * unresolved) can never match a *specific* location filter, since null
 * !== a real id - it only ever appears when neither side is constrained.
 * This is automatic from the equality check below, not a special case.
 */
export interface LocationFilterableOrder {
  id: string
  pickup_point_id: string | null
  delivery_point_id: string | null
}

export interface LocationFilter {
  pickupPointId: string | null
  deliveryPointId: string | null
}

export const isLocationFilterActive = (filter: LocationFilter): boolean =>
  filter.pickupPointId != null || filter.deliveryPointId != null

export const matchesLocationFilter = (order: LocationFilterableOrder, filter: LocationFilter): boolean => {
  if (filter.pickupPointId != null && order.pickup_point_id !== filter.pickupPointId) return false
  if (filter.deliveryPointId != null && order.delivery_point_id !== filter.deliveryPointId) return false
  return true
}

/**
 * Applied before any ranking/grouping (see Home.tsx) - Quick errands/High
 * reward/Best-on-the-board all operate on the already-location-filtered
 * list, so the two kinds of filter always compose rather than fight.
 */
export const filterByLocation = <T extends LocationFilterableOrder>(
  orders: readonly T[],
  filter: LocationFilter,
): T[] => (isLocationFilterActive(filter) ? orders.filter((o) => matchesLocationFilter(o, filter)) : orders.slice())

/**
 * Phase 3H — discovery personalization (two modes, never both at once -
 * see PHASE3_3H_PREFERENCES_PERSONALIZATION_SPEC.md §3/§8). Both filters
 * below sit in the exact same pipeline position as filterByLocation
 * above: applied once, upstream of every tab's own ranking, over the
 * already-fetched board - never a separate query, never touching tier/
 * reward computation.
 */

export interface GeoPoint {
  lat: number
  lng: number
}

/**
 * Haversine (straight-line/"as the crow flies"), never a routed distance
 * - the live device coordinate is never sent to the server, so there is
 * no routed number to compute here. Kept deliberately separate from
 * `distance_km` (3A's routed/fallback trip length) - the two must never
 * be blended into one figure or one trust decision (spec §3.1).
 */
export const haversineDistanceKm = (a: GeoPoint, b: GeoPoint): number => {
  const EARTH_RADIUS_KM = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export interface ProximityFilterableOrder {
  id: string
  pickup_point_id: string | null
}

/**
 * Discovery Mode A. `pickupPointById` resolves an order's pickup point to
 * a coordinate via the already-fetched campus-points list (no new fetch,
 * no MapLibre). An order whose pickup point doesn't resolve to a real
 * coordinate is never excluded - same "never hide what can't be honestly
 * measured" rule 3B already applies to routed-distance filtering,
 * extended here to the proximity signal. This never reads
 * distance_km/distance_source and never affects trust tier - it only
 * ever decides in/out of the candidate set (spec §9).
 */
export const filterByProximity = <T extends ProximityFilterableOrder>(
  orders: readonly T[],
  viewerPosition: GeoPoint,
  radiusKm: number,
  pickupPointById: ReadonlyMap<string, GeoPoint>,
): T[] =>
  orders.filter((o) => {
    if (!o.pickup_point_id) return true
    const point = pickupPointById.get(o.pickup_point_id)
    if (!point) return true
    return haversineDistanceKm(viewerPosition, point) <= radiusKm
  })

/**
 * Discovery Mode B (fallback) - pure membership, no distance component.
 * Matches on pickup OR delivery point, same "null never matches" rule
 * matchesLocationFilter already encodes for the manual Where filter.
 */
export const filterByPreferredAreas = <T extends LocationFilterableOrder>(
  orders: readonly T[],
  preferredPointIds: ReadonlySet<string>,
): T[] => {
  if (preferredPointIds.size === 0) return orders.slice()
  return orders.filter(
    (o) =>
      (o.pickup_point_id != null && preferredPointIds.has(o.pickup_point_id)) ||
      (o.delivery_point_id != null && preferredPointIds.has(o.delivery_point_id)),
  )
}
