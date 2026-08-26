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
