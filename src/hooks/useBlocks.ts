import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Block } from '@/lib/database-types'
import { getErrorMessage } from '@/lib/utils'

/**
 * Phase 3J - see PHASE3_3J_TRUST_SAFETY_SPEC.md §4. A plain hook, not a
 * context provider - same reasoning as useRatings.ts/useFriends.ts:
 * nothing here needs app-wide shared state. Every write goes through
 * block_user()/unblock_user() (SECURITY DEFINER RPCs) - this hook never
 * writes to the `blocks` table directly.
 */
export const useBlocks = () => {
  const [loading, setLoading] = useState(false)

  /** The caller's own outgoing blocks only - RLS makes anything else
   * return empty, not an error (see blocks_select_own). */
  const fetchMyBlocks = useCallback(async (): Promise<Block[]> => {
    const { data, error } = await supabase.from('blocks').select('*')
    if (error) return []
    return (data ?? []) as Block[]
  }, [])

  const isBlocked = useCallback(async (targetId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('blocks')
      .select('id')
      .eq('blocked_id', targetId)
      .maybeSingle()
    if (error) return false
    return data != null
  }, [])

  const blockUser = useCallback(async (targetId: string) => {
    setLoading(true)
    try {
      const { error } = await supabase.rpc('block_user', { p_blocked_id: targetId })
      if (error) throw new Error(getErrorMessage(error, 'Could not block this student'))
    } finally {
      setLoading(false)
    }
  }, [])

  const unblockUser = useCallback(async (targetId: string) => {
    setLoading(true)
    try {
      const { error } = await supabase.rpc('unblock_user', { p_blocked_id: targetId })
      if (error) throw new Error(getErrorMessage(error, 'Could not unblock this student'))
    } finally {
      setLoading(false)
    }
  }, [])

  return { loading, fetchMyBlocks, isBlocked, blockUser, unblockUser }
}
