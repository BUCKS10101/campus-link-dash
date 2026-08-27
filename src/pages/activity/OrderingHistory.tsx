import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useOrders } from '@/hooks/useOrders'
import { useRatings } from '@/hooks/useRatings'
import { Text } from '@/components/primitives'
import { HistoryList } from '@/components/activity/HistoryList'
import { TERMINAL_STATUSES } from '@/lib/orderStatus'

const HistorySkeleton = () => (
  <div className="max-w-measure" aria-busy="true">
    <span className="sr-only">Loading history</span>
    <Skeleton className="h-3 w-24" />
    <Skeleton className="mt-4 h-9 w-64 max-w-full" />
    <div className="mt-8 flex flex-col gap-2">
      <Skeleton className="h-5 w-full max-w-full" />
      <Skeleton className="h-5 w-full max-w-full" />
      <Skeleton className="h-5 w-full max-w-full" />
    </div>
  </div>
)

/**
 * The complete requester history - everything the preview on
 * OrderingActive.tsx only shows the latest 3 of. Fetched with no
 * `limit`, so this is the one place a full history query is actually
 * intended, scoped to `requester_id = viewer` only - never a deliverer
 * order, even one this same user also happened to deliver.
 */
const OrderingHistory = () => {
  const { user, loading: authLoading } = useAuth()
  const { orders, loading, error, fetchOrders } = useOrders()
  const { fetchMyRatedOrderIds } = useRatings()
  const [ratedOrderIds, setRatedOrderIds] = useState<Set<string>>(new Set())
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  useEffect(() => {
    if (!user) return
    fetchOrders({ mine: { as: 'customer', userId: user.user.id }, statusIn: TERMINAL_STATUSES })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    if (!user) return
    fetchMyRatedOrderIds(user.user.id).then(setRatedOrderIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    if (!loading && !hasLoadedOnce) setHasLoadedOnce(true)
  }, [loading, hasLoadedOnce])

  if (authLoading || (loading && !hasLoadedOnce)) {
    return <HistorySkeleton />
  }

  if (error) {
    return (
      <div className="max-w-measure">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Couldn't load your ordering history</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="max-w-measure">
      <Link
        to="/activity/ordering"
        className="font-body text-body-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        ← Back to Ordering
      </Link>
      <div className="mt-4 border-b-2 border-foreground pb-6">
        <Text variant="label" tone="faint" as="div">Activity · Ordering</Text>
        <Text variant="display" accent className="mt-4 block max-w-[22ch]">Ordering history</Text>
      </div>

      <div className="mt-8">
        <HistoryList
          orders={orders}
          role="requester"
          currentUserId={user.user.id}
          ratedOrderIds={ratedOrderIds}
          onRated={(orderId) => setRatedOrderIds((prev) => new Set(prev).add(orderId))}
          emptyMessage="No ordering history yet."
        />
      </div>
    </div>
  )
}

export default OrderingHistory
