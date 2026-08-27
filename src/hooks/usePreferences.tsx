import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { DEFAULT_USER_PREFERENCES } from '@/lib/database-types'
import type { UserPreferences } from '@/lib/database-types'

export type PreferencesUpdate = Partial<Omit<UserPreferences, 'user_id' | 'created_at'>>

interface PreferencesContextValue {
  preferences: UserPreferences | null
  preferredPointIds: ReadonlySet<string>
  loading: boolean
  savePreferences: (userId: string, updates: PreferencesUpdate) => Promise<void>
  savePreferredPoints: (userId: string, pointIds: readonly string[]) => Promise<void>
  resetPreferences: (userId: string) => Promise<void>
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

/**
 * Phase 3H - a single shared instance for the whole signed-in app, exactly
 * the same shape as NotificationsProvider (useNotifications.tsx). Settings
 * and Home previously each held their own independent `usePreferences()`
 * call - two disconnected copies of the same server row, so a change made
 * on one page (toggle live location, change radius, save preferred areas)
 * was invisible to the other until a full remount. That staleness was the
 * root cause of both "enabling GPS does nothing" (Home never saw the
 * updated `use_live_location` until its own effect happened to refire) and
 * "changing the radius does nothing until I navigate away and back." One
 * provider, fetched once per signed-in user and updated in place by every
 * writer, makes every consumer see the same state at the same time -
 * still exactly one batched fetch per session (spec §14), now shared
 * instead of duplicated.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.user.id ?? null

  const [preferences, setPreferences] = useState<UserPreferences | null>(null)
  const [preferredPointIds, setPreferredPointIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!userId) {
      setPreferences(null)
      setPreferredPointIds(new Set())
      return
    }

    let cancelled = false
    setLoading(true)

    const load = async () => {
      const [{ data: prefRow }, { data: pointRows }] = await Promise.all([
        supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('user_preferred_points').select('campus_point_id').eq('user_id', userId),
      ])
      if (cancelled) return
      setPreferences(
        (prefRow as UserPreferences | null) ?? {
          user_id: userId,
          created_at: '',
          ...DEFAULT_USER_PREFERENCES,
        },
      )
      setPreferredPointIds(new Set((pointRows ?? []).map((r: { campus_point_id: string }) => r.campus_point_id)))
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [userId])

  /** Partial - only the columns provided are changed, on an existing row
   * (Postgres upsert's ON CONFLICT DO UPDATE only touches the columns in
   * the payload) or defaulted per the table's own DEFAULTs on first
   * insert. Never includes a coordinate - see the spec's privacy model. */
  const savePreferences = async (targetUserId: string, updates: PreferencesUpdate) => {
    const { data, error } = await supabase
      .from('user_preferences')
      .upsert({ user_id: targetUserId, ...updates }, { onConflict: 'user_id' })
      .select()
      .single()
    if (error) throw error
    setPreferences(data as UserPreferences)
  }

  /** Full replace, not a diff - simplest correct behavior for a small,
   * infrequently-edited multi-select (spec §4). */
  const savePreferredPoints = async (targetUserId: string, pointIds: readonly string[]) => {
    const { error: deleteError } = await supabase.from('user_preferred_points').delete().eq('user_id', targetUserId)
    if (deleteError) throw deleteError

    if (pointIds.length > 0) {
      const { error: insertError } = await supabase
        .from('user_preferred_points')
        .insert(pointIds.map((campus_point_id) => ({ user_id: targetUserId, campus_point_id })))
      if (insertError) throw insertError
    }
    setPreferredPointIds(new Set(pointIds))
  }

  const resetPreferences = async (targetUserId: string) => {
    await savePreferences(targetUserId, DEFAULT_USER_PREFERENCES)
    await savePreferredPoints(targetUserId, [])
  }

  return (
    <PreferencesContext.Provider
      value={{ preferences, preferredPointIds, loading, savePreferences, savePreferredPoints, resetPreferences }}
    >
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences must be used within a PreferencesProvider')
  return ctx
}
