import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { useAnalytics } from '@/hooks/useAnalytics'
import { Text, Rule } from '@/components/primitives'
import { cn } from '@/lib/utils'
import type { CampusOrderVolumeDay, PopularLocation, BusyHour } from '@/lib/database-types'

const VOLUME_WINDOW_DAYS = 14
const POPULAR_LOCATIONS_LIMIT = 8

/** A plain proportional bar - no charting library, matching the app's
 * existing minimal visual language (Home/Settings use plain divs for
 * every other proportional display too). Width is relative to the
 * largest value in the same list, never a fixed/absolute scale, so a
 * quiet week and a busy week both render legibly. */
const Bar = ({ value, max, label, count }: { value: number; max: number; label: string; count: number }) => (
  <div className="flex items-center gap-3 py-1.5">
    <Text variant="caption" tone="muted" className="w-20 shrink-0 tabular-nums">{label}</Text>
    <div className="h-2 flex-1 bg-surface-sunken">
      <div
        className="h-full bg-primary-deep"
        style={{ width: max > 0 ? `${Math.max((value / max) * 100, value > 0 ? 2 : 0)}%` : '0%' }}
      />
    </div>
    <Text variant="caption" tone="faint" className="w-8 shrink-0 text-right tabular-nums">{count}</Text>
  </div>
)

const InsightsSkeleton = () => (
  <div className="max-w-measure" aria-busy="true">
    <span className="sr-only">Loading insights</span>
    <Skeleton className="h-3 w-24" />
    <Skeleton className="mt-4 h-9 w-64 max-w-full" />
    <div className="mt-10 flex flex-col gap-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
    </div>
  </div>
)

const formatDay = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const formatHour = (hour: number): string => {
  const period = hour < 12 ? 'AM' : 'PM'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display} ${period}`
}

/**
 * Phase 3I - campus-wide aggregate insights, see
 * PHASE3_3I_ANALYTICS_INTELLIGENCE_SPEC.md. Every number here comes from
 * a SECURITY DEFINER RPC that returns only aggregates - no order, no
 * requester, no deliverer is ever visible from this page. Available to
 * any signed-in user (no admin/role concept exists in this schema - see
 * spec §E), same trust tier get_profile_reputation already grants for
 * any profile lookup.
 */
const Insights = () => {
  const { getCampusOrderVolume, getPopularLocations, getBusyHours } = useAnalytics()
  const [volume, setVolume] = useState<CampusOrderVolumeDay[] | null>(null)
  const [locations, setLocations] = useState<PopularLocation[] | null>(null)
  const [hours, setHours] = useState<BusyHour[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      getCampusOrderVolume(VOLUME_WINDOW_DAYS),
      getPopularLocations(POPULAR_LOCATIONS_LIMIT),
      getBusyHours(),
    ])
      .then(([v, l, h]) => {
        if (cancelled) return
        setVolume(v)
        setLocations(l)
        setHours(h)
      })
      .catch(() => { if (!cancelled) setError('Please try again in a moment.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <InsightsSkeleton />

  if (error) {
    return (
      <div className="max-w-measure">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Couldn't load insights</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const totalRecent = (volume ?? []).reduce((sum, d) => sum + d.total_orders, 0)
  const maxDayVolume = Math.max(1, ...(volume ?? []).map((d) => d.total_orders))
  const maxLocationCount = Math.max(1, ...(locations ?? []).map((l) => l.total_count))
  const maxHourCount = Math.max(1, ...(hours ?? []).map((h) => h.order_count))

  return (
    <div className="max-w-measure">
      <div className="border-b-2 border-foreground pb-8">
        <Text variant="label" tone="faint" as="div">Campus insights</Text>
        <Text variant="display" accent className="mt-4 block max-w-[24ch]">
          {totalRecent > 0
            ? `${totalRecent} errands in the last ${VOLUME_WINDOW_DAYS} days.`
            : 'Nothing posted in the last 14 days yet.'}
        </Text>
        <Text variant="body" tone="muted" as="p" className="mt-3 max-w-[42ch]">
          Aggregate, campus-wide numbers only — never a specific order, requester, or deliverer.
        </Text>
      </div>

      <section className="mt-10">
        <Text variant="label" tone="faint" as="div" className="border-b border-border pb-3">
          Order volume · last {VOLUME_WINDOW_DAYS} days
        </Text>
        {volume && volume.length > 0 ? (
          <div className="mt-4">
            {volume.map((d) => (
              <Bar
                key={d.day}
                label={formatDay(d.day)}
                value={d.total_orders}
                max={maxDayVolume}
                count={d.total_orders}
              />
            ))}
          </div>
        ) : (
          <Text variant="bodySm" tone="faint" as="p" className="py-4">No orders yet in this window.</Text>
        )}
      </section>

      <section className="mt-10">
        <Text variant="label" tone="faint" as="div" className="border-b border-border pb-3">
          Popular locations
        </Text>
        {locations && locations.length > 0 ? (
          <div className="mt-4">
            {locations.map((l, i) => (
              <div key={l.campus_point_id}>
                {i > 0 && <Rule />}
                <div className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <Text variant="bodySm" className={cn('block', i === 0 && 'font-semibold')}>{l.label}</Text>
                    <Text variant="caption" tone="faint" as="p">
                      {l.pickup_count} pickup · {l.delivery_count} delivery
                    </Text>
                  </div>
                  <div className="h-2 w-24 shrink-0 bg-surface-sunken">
                    <div
                      className="h-full bg-primary-deep"
                      style={{ width: `${Math.max((l.total_count / maxLocationCount) * 100, 2)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Text variant="bodySm" tone="faint" as="p" className="py-4">No location data yet.</Text>
        )}
      </section>

      <section className="mt-10">
        <Text variant="label" tone="faint" as="div" className="border-b border-border pb-3">
          Busy hours · all-time
        </Text>
        {hours && hours.some((h) => h.order_count > 0) ? (
          <div className="mt-4">
            {hours.filter((h) => h.order_count > 0).map((h) => (
              <Bar
                key={h.hour_of_day}
                label={formatHour(h.hour_of_day)}
                value={h.order_count}
                max={maxHourCount}
                count={h.order_count}
              />
            ))}
          </div>
        ) : (
          <Text variant="bodySm" tone="faint" as="p" className="py-4">No orders yet.</Text>
        )}
      </section>
    </div>
  )
}

export default Insights
