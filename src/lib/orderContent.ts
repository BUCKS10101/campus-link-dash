import { z } from 'zod'

/**
 * orders.items is jsonb on the live database with no other consumer or
 * documented shape anywhere in the project (no other query reads a nested
 * field out of it, no spec defines it). This array-of-line-items shape is
 * our own documented choice, not a confirmed spec - chosen because it's
 * the most literal reading of a plural "items" column and maps directly
 * onto the existing free-text order-description UI (one line per item).
 * If a different shape turns out to be intended, only this file and
 * PostRequest.tsx's item-entry step need to change.
 */
export const OrderItemsSchema = z.array(z.string().trim().min(1)).min(1, 'Add at least one item')
export type OrderItems = z.infer<typeof OrderItemsSchema>

export const parseOrderItemsInput = (text: string): OrderItems =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

export const formatOrderItems = (items: unknown): string => {
  const result = OrderItemsSchema.safeParse(items)
  if (result.success) return result.data.join(', ')
  return typeof items === 'string' ? items : 'Order details unavailable'
}

/**
 * orders.delivery_location is jsonb - shape below mirrors exactly what
 * PostRequest.tsx already collects (a hostel type/block, or a campus
 * location name), just persisted as structured data instead of being
 * flattened into a single string. Also our own documented choice.
 *
 * NOTE: the live schema has no separate pickup_location column at all.
 * Pickup location isn't persisted separately - restaurant_name already
 * identifies where to pick up (a real column), so nothing is fabricated
 * to fill that gap; see the Phase 1B schema-mismatch report for why.
 */
export const DeliveryLocationSchema = z.object({
  type: z.enum(['hostel', 'campus']),
  label: z.string().trim().min(1),
  hostelType: z.enum(['mens', 'ladies']).optional(),
  block: z.string().trim().optional(),
})
export type DeliveryLocation = z.infer<typeof DeliveryLocationSchema>

export const formatDeliveryLocation = (location: unknown): string => {
  const result = DeliveryLocationSchema.safeParse(location)
  if (result.success) return result.data.label
  return typeof location === 'string' ? location : 'Location unavailable'
}

/**
 * orders has no restaurant_icon column. The emoji shown in the UI is
 * derived client-side from restaurant_name against this known list, with
 * a generic fallback for anything unrecognized - a display lookup, not
 * fabricated per-order data.
 */
const RESTAURANT_ICONS: Record<string, string> = {
  'One Food': '🍔',
  'DC Cafe': '☕',
  'Campus Store': '🛒',
}
export const FALLBACK_RESTAURANT_ICON = '🍽️'
export const getRestaurantIcon = (restaurantName: string): string =>
  RESTAURANT_ICONS[restaurantName] ?? FALLBACK_RESTAURANT_ICON

/**
 * compute_walking_route()/compute_walking_route_custom() return
 * geometry: null whenever the two points aren't graph-connected (see
 * PHASE3_3A_LOCATION_SPEC.md §4) - distance_km in that case is a
 * straight-line haversine number, not a walked distance. Collapsing both
 * cases into one "X km · about Y min walk" string (as the UI did before
 * this fix) misrepresents the fallback as a real route. This is the one
 * shared place that decides the wording, so every distance/ETA display
 * says the same true thing regardless of which page renders it.
 */
export type RouteEstimate = { distanceKm: number; etaMinutes: number; geometry: unknown | null }

export const formatRouteEstimate = (route: RouteEstimate, decimals: 1 | 2 = 1): string => {
  const km = route.distanceKm.toFixed(decimals)
  if (route.geometry) {
    return `${km} km · ~${Math.round(route.etaMinutes)} min walk`
  }
  return `~${km} km · distance estimate`
}

/**
 * Same routed/fallback honesty rule as formatRouteEstimate above, but for
 * an already-persisted order row (Home's board) rather than a live RPC
 * result - orders only ever store distance_km/distance_source, never a
 * route's geometry or its eta_minutes (see the orders.distance_source
 * migration), so ETA here is recomputed from the same public 5 km/h
 * constant compute_walking_route() itself uses - not a new invented
 * number, just re-deriving it from a real, already-trustworthy distance.
 * Only 'routed' ever gets "min walk" wording; every other case ('fallback',
 * 'unresolved', or a legacy null) is either a plain distance estimate or
 * no distance claim at all. See PHASE3_3B_NEARBY_DISCOVERY_SPEC.md §6.
 */
export type OrderDistance = { distance_km: number | null; distance_source: 'routed' | 'fallback' | 'unresolved' | null }

export const formatOrderDistance = (order: OrderDistance): string | null => {
  if (order.distance_km == null) return null
  const km = order.distance_km.toFixed(1)
  if (order.distance_source === 'routed') {
    const etaMinutes = Math.round((order.distance_km / 5) * 60)
    return `${km} km · ~${etaMinutes} min walk`
  }
  return `~${km} km · distance estimate`
}
