import React, { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import OrderCard from '@/components/orders/OrderCard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useOrders } from '@/hooks/useOrders'
import { useToast } from '@/hooks/use-toast'
import { useNavigate, Link } from 'react-router-dom'
import { formatOrderItems, formatDeliveryLocation, formatOrderDistance } from '@/lib/orderContent'
import { rankQuickErrands, rankHighReward, rankFeatured, hasUsableDistance, filterByLocation, isLocationFilterActive, type LocationFilter } from '@/lib/ranking'
import { useCampusPoints } from '@/hooks/useCampusPoints'
import { WhereFilter } from '@/components/home/WhereFilter'
import { Rule, Text } from '@/components/primitives'
import { getErrorMessage } from '@/lib/utils'
import type { OrderWithProfiles } from '@/lib/database-types'

const NO_LOCATION_FILTER: LocationFilter = { pickupPointId: null, deliveryPointId: null }

// "Nearby" is deliberately not a filter name here: nothing in the app
// knows where the viewing student actually is (profiles.hostel_block is
// never written anywhere - see PHASE3_3B_NEARBY_DISCOVERY_SPEC.md §2),
// so "Quick errands" (a short trip, not a claim about proximity to the
// viewer) is the only honest framing. "High reward" ranks by
// reward_density, not a raw tip threshold - see ranking.ts.
type FilterKey = 'all' | 'quick-errands' | 'high-reward'

// How many of the top of each ranked list get a reason chip - a small,
// fixed number so the label reads as "genuinely near the top of this
// list" rather than being attached to nearly everything on the board.
const REASON_CHIP_COUNT = 3

// OrderCard's caption slot is a single line ({order.distance} · posted
// {order.timeAgo}) - a reason, when one is justified by real ranking
// data, is appended into that same existing "distance" string rather
// than adding a new slot to the shared card component, so Home's IA
// change stays contained to this page.
const toPostingRow = (order: OrderWithProfiles, reason: string | null) => ({
  id: order.id,
  restaurant: { name: order.restaurant_name },
  items: formatOrderItems(order.items),
  tip: order.tip_amount,
  distance: [formatOrderDistance(order) ?? 'distance unknown', reason].filter(Boolean).join(' · '),
  location: formatDeliveryLocation(order.delivery_location),
  timeAgo: new Date(order.created_at).toLocaleString('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }),
})

const HomeSkeleton = () => (
  <div aria-busy="true">
    <span className="sr-only">Loading the board</span>
    <div className="border-b-2 border-foreground pb-8" aria-hidden="true">
      <Skeleton className="h-3 w-28" />
      <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-10 w-64 max-w-full" />
          <Skeleton className="h-10 w-48 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28 shrink-0" />
      </div>
    </div>
    <div className="flex items-center gap-2 border-b border-border py-5" aria-hidden="true">
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-8 w-24" />
    </div>
    <div className="flex flex-col gap-3 border-b border-border py-8 sm:flex-row sm:items-end sm:justify-between" aria-hidden="true">
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>
      <Skeleton className="h-11 w-40 shrink-0" />
    </div>
  </div>
)

const Home = () => {
  const { toast } = useToast()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { orders, loading, error, fetchOrders, acceptOrder, subscribeToOrders } = useOrders()
  // Campus points for the Where search fields only - one small reference
  // fetch on mount (already used elsewhere, e.g. PostRequest), never
  // re-fetched on a filter change, and never touches MapLibre.
  const { points: campusPoints } = useCampusPoints()
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [locationFilter, setLocationFilter] = useState<LocationFilter>(NO_LOCATION_FILTER)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  // Only the very first load blanks the whole page - a filter change
  // refetches too (same `loading` flag) but should never make the header
  // and filter row disappear along with it.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  // Ranking (3B) is entirely client-side over this one already-fetched
  // feed - filter chips no longer trigger a re-fetch or a separate query
  // (the old nearby/highTips server-side filters are gone), so switching
  // chips is instant and adds zero network requests. See
  // PHASE3_3B_NEARBY_DISCOVERY_SPEC.md §9-§10.
  useEffect(() => {
    if (!user) return

    fetchOrders({ viewerId: user.user.id })

    const unsubscribe = subscribeToOrders(() => {
      fetchOrders({ viewerId: user.user.id })
    })

    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    if (!loading && !hasLoadedOnce) setHasLoadedOnce(true)
  }, [loading, hasLoadedOnce])

  // Where (From/To) is applied first, client-side, over the one
  // already-fetched feed - never a separate query. Every downstream
  // grouping (featured/Quick errands/High reward/All) operates on this
  // already-narrowed list, so the two kinds of filter always compose
  // instead of fighting - see PHASE3_3B_NEARBY_DISCOVERY_SPEC.md's Where
  // follow-up notes.
  const locationFilteredOrders = useMemo(
    () => filterByLocation(orders, locationFilter),
    [orders, locationFilter],
  )

  // The dominant opportunity up top is the best real deal on the board
  // right now: highest reward_density where any order has a usable
  // distance, otherwise highest tip (rankFeatured handles both) - never
  // a separate rule from what "High reward" itself ranks by.
  const featuredOrder = useMemo(() => rankFeatured(locationFilteredOrders), [locationFilteredOrders])

  const restOrders = useMemo(
    () => locationFilteredOrders.filter((o) => o.id !== featuredOrder?.id),
    [locationFilteredOrders, featuredOrder],
  )

  // Ranked over the full (location-filtered) board, not restOrders -
  // switching to Quick errands/High reward should show the complete,
  // honestly-ranked list (including whatever's also featured above in
  // the All view), not silently drop whichever order happens to be
  // featured right now.
  const quickErrandOrders = useMemo(() => rankQuickErrands(locationFilteredOrders), [locationFilteredOrders])
  const highRewardOrders = useMemo(() => rankHighReward(locationFilteredOrders), [locationFilteredOrders])

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: locationFilteredOrders.length },
    { key: 'quick-errands', label: 'Quick errands', count: quickErrandOrders.length },
    { key: 'high-reward', label: 'High reward', count: highRewardOrders.length },
  ]

  const pointLabelById = useMemo(() => new Map(campusPoints.map((p) => [p.id, p.label])), [campusPoints])
  const locationFilterSummary = useMemo(() => {
    if (!isLocationFilterActive(locationFilter)) return null
    const parts: string[] = []
    if (locationFilter.pickupPointId) parts.push(`From: ${pointLabelById.get(locationFilter.pickupPointId) ?? 'Unknown'}`)
    if (locationFilter.deliveryPointId) parts.push(`To: ${pointLabelById.get(locationFilter.deliveryPointId) ?? 'Unknown'}`)
    return parts.join(' · ')
  }, [locationFilter, pointLabelById])

  // Small, explainable reason chips - never an opaque score, and never
  // attached to more than the top handful of each ranked list. A reward
  // reason only ever attaches to an order that actually has a computed
  // reward_density (never to an unresolved order ranked by raw tip alone
  // in the same list) - see ranking.ts's rankHighReward.
  const quickErrandReasonIds = useMemo(
    () => new Set(quickErrandOrders.slice(0, REASON_CHIP_COUNT).map((o) => o.id)),
    [quickErrandOrders],
  )
  const highRewardReasonIds = useMemo(
    () => new Set(highRewardOrders.filter(hasUsableDistance).slice(0, REASON_CHIP_COUNT).map((o) => o.id)),
    [highRewardOrders],
  )
  const reasonFor = (orderId: string): string | null => {
    if (quickErrandReasonIds.has(orderId)) return 'Quick errand nearby'
    if (highRewardReasonIds.has(orderId)) return 'Good reward for the distance'
    return null
  }

  const visibleOrders = useMemo(() => {
    if (activeFilter === 'quick-errands') return quickErrandOrders
    if (activeFilter === 'high-reward') return highRewardOrders
    return restOrders
  }, [activeFilter, restOrders, quickErrandOrders, highRewardOrders])

  // Reflects the currently-effective (location-filtered) view, not the
  // raw board - showing "14 students need a hand" while a Where filter
  // only matches 1 would be a contradictory state.
  const totalTip = useMemo(
    () => locationFilteredOrders.reduce((sum, o) => sum + o.tip_amount, 0),
    [locationFilteredOrders],
  )

  const handleAcceptOrder = async (orderId: string) => {
    if (!user) return
    setAcceptingId(orderId)
    try {
      await acceptOrder(orderId, user.user.id)
      toast({ title: 'Taken', description: "It's yours — head to Activity to see it." })
      navigate('/my-orders')
    } catch (error) {
      toast({
        title: 'Someone got there first',
        description: getErrorMessage(error, 'That run was already taken.'),
        variant: 'destructive',
      })
    } finally {
      setAcceptingId(null)
    }
  }

  if (authLoading || (loading && !hasLoadedOnce)) {
    return <HomeSkeleton />
  }

  return (
    <>
      {/* The one large color field on Home, deliberately rare - forest
          ground, ivory type. Emphasis here comes from scale and contrast
          against the panel, not from the wine signal, which stays reserved
          for actionable things (Take, the per-order tip) everywhere else
          on the page. Breaks out to the layout container's horizontal
          edges only (not the full viewport - AppShell/PageContainer stay
          untouched); vertically it keeps PageContainer's own top padding
          rather than cancelling it, so it always sits with clear breathing
          room below the sticky desktop navbar instead of flush against it. */}
      <div className="-mx-4 bg-foreground px-4 py-10 text-background sm:-mx-6 sm:px-6 md:px-10 md:py-14">
        <Text variant="label" tone="inherit" as="div" className="opacity-60">The board, live</Text>
        <div className="mt-5 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <Text variant="display" accent tone="inherit" className="max-w-[16ch] block text-[2.75rem] leading-[0.98] sm:text-[3.5rem] md:text-[4rem]">
            {locationFilteredOrders.length === 0 && 'Nothing moving right now.'}
            {locationFilteredOrders.length === 1 && 'One student needs a hand.'}
            {locationFilteredOrders.length > 1 && `${locationFilteredOrders.length} students need a hand.`}
          </Text>
          {totalTip > 0 && (
            <div className="shrink-0 text-left md:text-right">
              <Text
                variant="dataLg"
                tone="inherit"
                className="block text-[3.25rem] leading-none tabular-nums sm:text-[4rem] md:text-[4.5rem]"
              >
                ₹{totalTip}
              </Text>
              <Text variant="caption" tone="inherit" className="mt-1 block opacity-60">up for grabs right now</Text>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-1 rounded-sm border-b border-border bg-surface-sunken px-2 py-3 md:mt-10">
        {filters.map((filter) => (
          <button
            key={filter.key}
            onClick={() => setActiveFilter(filter.key)}
            aria-pressed={activeFilter === filter.key}
            className={cn(
              'rounded-sm px-3 py-1.5 font-body text-body-sm font-medium transition-colors duration-fast ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              activeFilter === filter.key
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {filter.label}
            <span className="ml-1.5 font-data text-caption tabular-nums opacity-70">{filter.count}</span>
          </button>
        ))}
        <div className="ml-auto">
          <WhereFilter
            points={campusPoints}
            value={locationFilter}
            onApply={setLocationFilter}
            onClear={() => setLocationFilter(NO_LOCATION_FILTER)}
            summary={locationFilterSummary}
          />
        </div>
      </div>

      {/* Keyed on the active filter so a filter change cross-fades this
          whole region in fresh, rather than the old list hard-cutting to
          new content. Dimmed (not blanked) while a refetch is in flight -
          the header and filter row above stay fully present throughout. */}
      <div key={activeFilter} className={cn('animate-rise-in transition-opacity duration-base', loading && 'opacity-50')}>
        {error && (
          <Alert variant="destructive" className="my-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Couldn't load the board</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!error && orders.length === 0 && (
          <div className="flex flex-col items-start gap-4 py-10">
            <Text variant="body" tone="muted" className="max-w-[42ch]">
              Runs show up here the moment another student posts one. Nothing to take right now —
              post your own request instead, and someone already headed that way can pick it up.
            </Text>
            <Link
              to="/post-request"
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 font-body text-body-sm font-semibold text-primary-foreground transition-colors duration-fast ease-out hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Post a request
            </Link>
          </div>
        )}

        {!error && featuredOrder && activeFilter === 'all' && (
          <div className="border-b border-border pb-8 pt-6">
            <Text variant="label" tone="faint" as="div" className="pb-3">
              Best on the board
            </Text>
            <OrderCard
              order={toPostingRow(featuredOrder, reasonFor(featuredOrder.id))}
              onAccept={handleAcceptOrder}
              accepting={acceptingId === featuredOrder.id}
              featured
            />
          </div>
        )}

        {!error && visibleOrders.length > 0 && (
          <div>
            <Text variant="label" tone="faint" as="div" className="pb-1 pt-8">
              {activeFilter === 'quick-errands' && 'Quick errands'}
              {activeFilter === 'high-reward' && 'High reward'}
              {activeFilter === 'all' && 'More on the board'}
            </Text>
            {visibleOrders.map((order, i) => (
              <React.Fragment key={order.id}>
                <Rule />
                <div
                  className="animate-rise-in"
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                >
                  <OrderCard
                    order={toPostingRow(order, reasonFor(order.id))}
                    onAccept={handleAcceptOrder}
                    accepting={acceptingId === order.id}
                  />
                </div>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Never a decorative empty section - each cause gets its own
            honest explanation for why nothing is showing: a Where filter
            matching nothing, "nothing matches this ranking filter", and
            "the whole board is empty" are three different facts. The
            Where case takes priority since it's the reason nothing else
            below found anything either. */}
        {!error && orders.length > 0 && locationFilteredOrders.length === 0 && (
          <div className="flex flex-col items-start gap-3 py-10">
            <Text variant="bodySm" tone="faint">
              Nothing matches {locationFilterSummary} right now.
            </Text>
            <Button variant="outline" size="sm" onClick={() => setLocationFilter(NO_LOCATION_FILTER)}>
              Clear location filter
            </Button>
          </div>
        )}

        {!error && locationFilteredOrders.length > 0 && visibleOrders.length === 0 && activeFilter === 'all' && featuredOrder && (
          <div className="flex flex-col items-start gap-3 py-10">
            <Text variant="bodySm" tone="faint">That's everything on the board right now.</Text>
            <Link
              to="/post-request"
              className="inline-flex items-center gap-1.5 rounded-sm border border-border px-4 py-2 font-body text-body-sm font-semibold text-foreground transition-colors duration-fast ease-out hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Post your own request
            </Link>
          </div>
        )}

        {!error && locationFilteredOrders.length > 0 && visibleOrders.length === 0 && activeFilter === 'quick-errands' && (
          <div className="py-10">
            <Text variant="bodySm" tone="faint">
              Nothing on the board right now has a real distance to judge — check back soon, or try All.
            </Text>
          </div>
        )}

        {!error && locationFilteredOrders.length > 0 && visibleOrders.length === 0 && activeFilter === 'high-reward' && (
          <div className="py-10">
            <Text variant="bodySm" tone="faint">Nothing left to rank — try All.</Text>
          </div>
        )}
      </div>
    </>
  )
}

export default Home
