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

  return { submitting, submitRating, fetchMyRatedOrderIds, getProfileReputation }
}
