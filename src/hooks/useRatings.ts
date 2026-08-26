import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ProfileReputation } from '@/lib/database-types'
import { RatingSchema, validateOrThrow } from '@/lib/validation'
import { getErrorMessage } from '@/lib/utils'

/**
 * Phase 3D - see PHASE3_3D_RATINGS_TRUST_SPEC.md. A plain hook, not a
 * context provider: unlike notifications (3C), nothing here needs
 * app-wide shared state or a realtime subscription - each caller fetches
 * exactly what it needs, once, the same shape as useOrders.ts/useChat.ts.
 */
export const useRatings = () => {
  const [submitting, setSubmitting] = useState(false)

  /**
   * All authorization (participant check, delivered-state check,
   * self-rating impossibility, duplicate check) happens inside
   * submit_rating() itself - this is a thin wrapper, not a second place
   * that re-implements any of those rules client-side.
   */
  const submitRating = async (orderId: string, score: number, comment: string): Promise<void> => {
    const validated = validateOrThrow(RatingSchema, { score, comment })
    setSubmitting(true)
    try {
      const { error } = await supabase.rpc('submit_rating', {
        p_order_id: orderId,
        p_score: validated.score,
        p_comment: validated.comment || null,
      })
      if (error) throw new Error(getErrorMessage(error, 'Could not submit rating'))
    } finally {
      setSubmitting(false)
    }
  }

  /** One query, not one per order - see MyOrders.tsx's "already rated" check. */
  const fetchMyRatedOrderIds = async (reviewerId: string): Promise<Set<string>> => {
    const { data, error } = await supabase.from('ratings').select('order_id').eq('reviewer_id', reviewerId)
    if (error) return new Set()
    return new Set((data ?? []).map((r: { order_id: string }) => r.order_id))
  }

  const getProfileReputation = async (profileId: string): Promise<ProfileReputation | null> => {
    const { data, error } = await supabase.rpc('get_profile_reputation', { p_profile_id: profileId })
    if (error) return null
    const row = (data as unknown as ProfileReputation[])?.[0]
    return row ?? null
  }

  /**
   * Phase 3F - batched, to avoid the N+1 a per-order get_profile_reputation
   * call would be against a whole Home feed. See
   * PHASE3_3F_SMART_MATCHING_SPEC.md §11. Returns a Map keyed by profile
   * id so callers never need to know which ids happened to have zero
   * ratings vs which failed to resolve at all.
   */
  const getProfilesReputation = async (
    profileIds: string[],
  ): Promise<Map<string, { avg_rating: number | null; rating_count: number }>> => {
    const uniqueIds = Array.from(new Set(profileIds))
    if (uniqueIds.length === 0) return new Map()

    const { data, error } = await supabase.rpc('get_profiles_reputation', { p_profile_ids: uniqueIds })
    if (error) return new Map()

    const rows = (data ?? []) as unknown as { id: string; avg_rating: number | null; rating_count: number }[]
    return new Map(rows.map((r) => [r.id, { avg_rating: r.avg_rating, rating_count: r.rating_count }]))
  }

  return { submitting, submitRating, fetchMyRatedOrderIds, getProfileReputation, getProfilesReputation }
}
