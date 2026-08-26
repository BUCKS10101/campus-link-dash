import React, { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import OrderCard from '@/components/orders/OrderCard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useOrders } from '@/hooks/useOrders'
import { useToast } from '@/hooks/use-toast'
import { useNavigate, Link } from 'react-router-dom'
import { formatOrderItems, formatDeliveryLocation } from '@/lib/orderContent'
import { Rule, Text } from '@/components/primitives'
import { getErrorMessage } from '@/lib/utils'
import type { OrderWithProfiles } from '@/lib/database-types'

type FilterKey = 'all' | 'nearby' | 'high-tips'

const toPostingRow = (order: OrderWithProfiles) => ({
  id: order.id,
  restaurant: { name: order.restaurant_name },
  items: formatOrderItems(order.items),
  tip: order.tip_amount,
  distance: order.distance_km != null ? `${order.distance_km.toFixed(1)} km` : 'distance unknown',
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
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  // Only the very first load blanks the whole page - a filter change
  // refetches too (same `loading` flag) but should never make the header
  // and filter row disappear along with it.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  useEffect(() => {
    if (!user) return

    fetchOrders({
      nearby: activeFilter === 'nearby',
      highTips: activeFilter === 'high-tips',
      viewerId: user.user.id,
    })

    const unsubscribe = subscribeToOrders(() => {
      fetchOrders({
        nearby: activeFilter === 'nearby',
        highTips: activeFilter === 'high-tips',
        viewerId: user.user.id,
      })
    })

    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeFilter])

  useEffect(() => {
    if (!loading && !hasLoadedOnce) setHasLoadedOnce(true)
  }, [loading, hasLoadedOnce])

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: orders.length },
    { key: 'nearby', label: 'Nearby', count: orders.filter(o => o.distance_km != null && o.distance_km < 1).length },
    { key: 'high-tips', label: 'High tip', count: orders.filter(o => o.tip_amount >= 40).length },
  ]

  // The dominant opportunity up top is the best real deal on the board
  // right now, not an arbitrary first row - highest tip, ties broken by
  // most recent (orders already arrive sorted created_at desc).
  const featuredOrder = useMemo(() => {
    if (orders.length === 0) return null
    return [...orders].sort((a, b) => b.tip_amount - a.tip_amount)[0]
  }, [orders])

  const restOrders = useMemo(
    () => orders.filter((o) => o.id !== featuredOrder?.id),
    [orders, featuredOrder],
  )

  const totalTip = useMemo(() => orders.reduce((sum, o) => sum + o.tip_amount, 0), [orders])

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
            {orders.length === 0 && 'Nothing moving right now.'}
            {orders.length === 1 && 'One student needs a hand.'}
            {orders.length > 1 && `${orders.length} students need a hand.`}
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

      <div className="mt-8 flex items-center gap-1 rounded-sm border-b border-border bg-surface-sunken px-2 py-3 md:mt-10">
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

        {!error && featuredOrder && (
          <div className="border-b border-border pb-8 pt-6">
            <Text variant="label" tone="faint" as="div" className="pb-3">
              Best on the board
            </Text>
            <OrderCard
              order={toPostingRow(featuredOrder)}
              onAccept={handleAcceptOrder}
              accepting={acceptingId === featuredOrder.id}
              featured
            />
          </div>
        )}

        {!error && restOrders.length > 0 && (
          <div>
            <Text variant="label" tone="faint" as="div" className="pb-1 pt-8">
              More on the board
            </Text>
            {restOrders.map((order, i) => (
              <React.Fragment key={order.id}>
                <Rule />
                <div
                  className="animate-rise-in"
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                >
                  <OrderCard
                    order={toPostingRow(order)}
                    onAccept={handleAcceptOrder}
                    accepting={acceptingId === order.id}
                  />
                </div>
              </React.Fragment>
            ))}
          </div>
        )}

        {!error && featuredOrder && restOrders.length === 0 && (
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
      </div>
    </>
  )
}

export default Home
