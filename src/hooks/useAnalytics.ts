import { supabase } from '@/lib/supabase'
import type { MyActivitySummary, CampusOrderVolumeDay, PopularLocation, BusyHour } from '@/lib/database-types'

/**
 * Phase 3I - see PHASE3_3I_ANALYTICS_INTELLIGENCE_SPEC.md. A plain hook,
 * same shape as useRatings.ts - thin RPC wrappers, no client-side
 * aggregation, no shared/global state (this is read-on-demand data, not
 * something two pages need to stay in sync on live, unlike 3H's
 * preferences). Every number returned by these RPCs is already computed
 * server-side under SECURITY DEFINER, exactly the get_profile_reputation()
 * precedent - nothing here re-derives or re-aggregates anything client-side.
 */
export const useAnalytics = () => {
  /** The caller's own activity, scoped server-side to auth.uid() - see
   * get_my_activity_summary() in the 3I migration. */
  const getMyActivitySummary = async (): Promise<MyActivitySummary | null> => {
    const { data, error } = await supabase.rpc('get_my_activity_summary')
    if (error) return null
    const row = (data as unknown as MyActivitySummary[])?.[0]
    return row ?? null
  }

  /** Campus-wide daily order volume for the trailing p_days days
   * (server clamps to 1-90) - never scoped to or identifying any one
   * user, safe for any authenticated caller. */
  const getCampusOrderVolume = async (days = 30): Promise<CampusOrderVolumeDay[]> => {
    const { data, error } = await supabase.rpc('get_campus_order_volume', { p_days: days })
    if (error) return []
    return (data ?? []) as unknown as CampusOrderVolumeDay[]
  }

  /** Top campus_points by combined pickup+delivery order count (server
   * clamps limit to 1-50). */
  const getPopularLocations = async (limit = 10): Promise<PopularLocation[]> => {
    const { data, error } = await supabase.rpc('get_popular_locations', { p_limit: limit })
    if (error) return []
    return (data ?? []) as unknown as PopularLocation[]
  }

  /** Hour-of-day (0-23) order-creation demand histogram, always all 24
   * hours present (zero-filled server-side). */
  const getBusyHours = async (): Promise<BusyHour[]> => {
    const { data, error } = await supabase.rpc('get_busy_hours')
    if (error) return []
    return (data ?? []) as unknown as BusyHour[]
  }

  return { getMyActivitySummary, getCampusOrderVolume, getPopularLocations, getBusyHours }
}
