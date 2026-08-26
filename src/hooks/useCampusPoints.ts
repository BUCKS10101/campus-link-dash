import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CampusPoint, CampusPointKind } from '@/lib/database-types'

/** Display order for the location picker - see PHASE3_3A_LOCATION_SPEC.md §8. */
export const CAMPUS_POINT_CATEGORIES: { kind: CampusPointKind; label: string }[] = [
  { kind: 'food', label: 'Food' },
  { kind: 'shop', label: 'Shops' },
  { kind: 'accommodation', label: 'Accommodation' },
  { kind: 'academic', label: 'Academic' },
  { kind: 'sports', label: 'Sports & Recreation' },
  { kind: 'medical', label: 'Medical & Health' },
  { kind: 'landmark', label: 'Landmarks' },
]

/**
 * Real campus reference points - see
 * supabase/migrations/20260826100000_campus_points.sql. RLS
 * (campus_points_select_active) already restricts this to active rows, so
 * every point returned here has a real, sourced coordinate; most of the
 * app's ~31 named pickup/hostel/landmark options are NOT yet in this list
 * (see PHASE3_3A_ARCHITECTURE_PROPOSAL.md) - callers must treat a missing
 * `byKey()` match as "no real coordinate yet," not an error.
 */
export const useCampusPoints = () => {
  const [points, setPoints] = useState<CampusPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    supabase
      .from('campus_points')
      .select('id, key, label, kind, wing, lat, lng')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Error fetching campus points:', error)
        setPoints((data as CampusPoint[]) ?? [])
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  const byKey = (key: string): CampusPoint | undefined => points.find((p) => p.key === key)
  const byCategory = (kind: CampusPointKind): CampusPoint[] =>
    points.filter((p) => p.kind === kind).sort((a, b) => a.label.localeCompare(b.label))
  // Real geographic identity (CampusPoint.wing), not derived from the
  // label or key - see PHASE3_3A_LOCATION_SPEC.md's Accommodation
  // correction. `wing: null` also matches an accommodation point whose
  // wing hasn't been confirmed yet, alongside genuinely wingless points
  // (MGB, the Annexes) - both fall into the same "Annex / Other" picker
  // bucket until confirmed.
  const byWing = (wing: 'mens' | 'ladies' | null): CampusPoint[] =>
    points.filter((p) => p.kind === 'accommodation' && p.wing === wing).sort((a, b) => a.label.localeCompare(b.label))

  return { points, byKey, byCategory, byWing, loading }
}
