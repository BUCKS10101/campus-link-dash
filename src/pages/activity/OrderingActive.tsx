import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useOrders } from '@/hooks/useOrders'
import { useRatings } from '@/hooks/useRatings'
import { cn } from '@/lib/utils'
import { Text } from '@/components/primitives'
import { ActiveOrdersSection } from '@/components/activity/ActiveOrdersSection'
import { HistoryList } from '@/components/activity/HistoryList'
import { ActivityRoleSwitch } from '@/components/activity/ActivityRoleSwitch'
import { ACTIVE_STATUSES, TERMINAL_STATUSES } from '@/lib/orderStatus'
import type { OrderWithProfiles } from '@/lib/database-types'

const HISTORY_PREVIEW_COUNT = 3

const ActivitySkeleton = () => (
  <div className="max-w-measure" aria-busy="true">
    <span className="sr-only">Loading activity</span>
    <div className="border-b-2 border-foreground pb-8" aria-hidden="true">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-4 h-9 w-72 max-w-full" />
      <Skeleton className="mt-3 h-4 w-40" />
    </div>
    <div className="mt-8" aria-hidden="true">
      <Skeleton className="h-3 w-24" />
      <div className="mt-5 flex flex-col gap-2">
        <Skeleton className="h-5 w-48 max-w-full" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>
    </div>
  </div>
)

/**
 * Activity → Ordering. The requester's own view - see
 * PHASE3_ACTIVITY_RESTRUCTURE. Two independent fetches, not one combined
 * fetch filtered client-side: active orders (statusIn ACTIVE_STATUSES,
 * requester_id = viewer) and a capped 3-item history preview (statusIn
 * TERMINAL_STATUSES, same scope, limit 3) - the preview never pulls the
 * viewer's entire order history just to show three rows.
 */
const OrderingActive = () => {
  const { user, loading: authLoading } = useAuth()
  const [searchParams] = useSearchParams()

  const active = useOrders()
  const history = useOrders()
  const { fetchMyRatedOrderIds } = useRatings()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [ratedOrderIds, setRatedOrderIds] = useState<Set<string>>(new Set())
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  const refetchActive = () => {
    if (user) active.fetchOrders({ mine: { as: 'customer', userId: user.user.id }, statusIn: ACTIVE_STATUSES })
  }

  useEffect(() => {
    if (!user) return
    refetchActive()
    const unsubscribe = active.subscribeToOrders(refetchActive)
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    if (!user) return
    history.fetchOrders({
      mine: { as: 'customer', userId: user.user.id },
      statusIn: TERMINAL_STATUSES,
      limit: HISTORY_PREVIEW_COUNT,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    if (!user) return
    fetchMyRatedOrderIds(user.user.id).then(setRatedOrderIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Deep-link from a notification's click-through (?order=<id>).
  useEffect(() => {
    const targetId = searchParams.get('order')
    if (!targetId) return
    if (active.orders.some((o) => o.id === targetId)) setExpandedId(targetId)
  }, [searchParams, active.orders])

  useEffect(() => {
    if (!active.loading && !hasLoadedOnce) setHasLoadedOnce(true)
  }, [active.loading, hasLoadedOnce])

  const handleAdvance = async (order: OrderWithProfiles) => {
    // Ordering is the requester's own view - advancing a delivery's
    // status is a deliverer-only action, never surfaced here.
    void order
  }

  const handleCancel = async (order: OrderWithProfiles, role: 'requester' | 'deliverer') => {
    if (!user) return
    await active.cancelOrder(order.id, role, user.user.id)
    refetchActive()
  }

  const handleRated = (orderId: string) => setRatedOrderIds((prev) => new Set(prev).add(orderId))

  if (authLoading || (active.loading && !hasLoadedOnce)) {
    return <ActivitySkeleton />
  }

  if (active.error) {
    return (
      <div className="max-w-measure">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Couldn't load your orders</AlertTitle>
          <AlertDescription>{active.error}</AlertDescription>
        </Alert>
        <Button className="mt-4" onClick={refetchActive}>Try again</Button>
      </div>
    )
  }

  if (!user) return null

  const activeOrders = active.orders
  const headline = activeOrders.length === 0
    ? "Nothing needs you right now."
    : activeOrders.length === 1
      ? "You're waiting on one request."
      : `You're waiting on ${activeOrders.length} requests.`

  return (
    <div className={cn('max-w-measure transition-opacity duration-base', active.loading && 'opacity-60')}>
      <div className="border-b-2 border-foreground pb-8">
        <Text variant="label" tone="faint" as="div">Activity · Ordering</Text>
        <Text variant="display" accent className="mt-4 block max-w-[22ch]">{headline}</Text>
      </div>

      <div className="mt-6">
        <ActivityRoleSwitch active="ordering" />
      </div>

      <div className="mt-8">
        <ActiveOrdersSection
          title="Active orders"
          role="requester"
          orders={activeOrders}
          expandedId={expandedId}
          onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
          emptyMessage="Nothing active."
          emptyCtaLabel="Post a request"
          emptyCtaHref="/post-request"
          currentUserId={user.user.id}
          getMyOrderOtp={active.getMyOrderOtp}
          verifyDeliveryOtp={active.verifyDeliveryOtp}
          computeWalkingRoute={active.computeWalkingRoute}
          computeWalkingRouteCustom={active.computeWalkingRouteCustom}
          onAdvance={handleAdvance}
          onVerified={refetchActive}
          onCancel={handleCancel}
        />
      </div>

      <section className="mt-12 max-w-measure">
        <Text variant="label" tone="faint" as="div" className="border-b border-border pb-3">History</Text>
        <HistoryList
          orders={history.orders}
          role="requester"
          currentUserId={user.user.id}
          ratedOrderIds={ratedOrderIds}
          onRated={handleRated}
          limit={HISTORY_PREVIEW_COUNT}
          emptyMessage="No ordering history yet."
          viewAllHref="/activity/ordering/history"
        />
      </section>
    </div>
  )
}

export default OrderingActive
