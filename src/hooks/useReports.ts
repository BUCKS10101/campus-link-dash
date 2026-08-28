import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ReportReason } from '@/lib/database-types'
import { getErrorMessage } from '@/lib/utils'

/**
 * Phase 3J - see PHASE3_3J_TRUST_SAFETY_SPEC.md §5. A plain hook, not a
 * context provider - same reasoning as useBlocks.ts/useRatings.ts. The
 * only write path is file_report(), a SECURITY DEFINER RPC that
 * self-report-guards and rate-limits (5/day) server-side.
 */
export const useReports = () => {
  const [loading, setLoading] = useState(false)

  const withLoading = async <T,>(fn: () => Promise<T>): Promise<T> => {
    setLoading(true)
    try {
      return await fn()
    } finally {
      setLoading(false)
    }
  }

  const fileReport = (
    reportedUserId: string,
    reason: ReportReason,
    description?: string,
    orderId?: string | null,
  ) => withLoading(async () => {
    const { data, error } = await supabase.rpc('file_report', {
      p_reported_user_id: reportedUserId,
      p_order_id: orderId ?? null,
      p_reason: reason,
      p_description: description ?? null,
    })
    if (error) throw new Error(getErrorMessage(error, 'Could not file report'))
    return data as unknown as string
  })

  return { loading, fileReport }
}
