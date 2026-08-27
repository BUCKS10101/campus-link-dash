import React from 'react'
import { Link } from 'react-router-dom'
import { RatingDialog } from '@/components/ratings/RatingDialog'
import { Text, Rule, StatusBadge } from '@/components/primitives'
import type { OrderWithProfiles } from '@/lib/database-types'

/**
 * One historical order row - extracted verbatim from the pre-restructure
 * MyOrders.tsx "Earlier" section, now used by both the compact preview
 * (Ordering/Delivering active pages, capped at 3) and the full history
 * pages (uncapped) - one row implementation, two call sites, never two
 * copies of the same rendering.
 */
const HistoryRow = ({
  order,
  role,
  currentUserId,
  canRate,
  onRated,
}: {
  order: OrderWithProfiles
  role: 'requester' | 'deliverer'
  currentUserId: string
  canRate: boolean
  onRated: (orderId: string) => void
}) => {
  const isRequester = role === 'requester'
  const counterpartName = (isRequester ? order.deliverer_profile?.name : order.requester_profile?.name) ?? null
  const isCancelled = order.status === 'cancelled'
  // cancelled_at is null on any order cancelled before that migration
  // existed - created_at is the only honest fallback for those, never a
  // guessed date.
  const historyDate = isCancelled && order.cancelled_at ? order.cancelled_at : order.created_at
  const cancelledBySelf = isCancelled && order.cancelled_by === currentUserId
  const historyLabel = isCancelled
    ? (cancelledBySelf ? 'You cancelled' : 'They cancelled')
    : (isRequester ? 'Asked' : 'Carried')

  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <Text variant="caption" tone="muted" className="block font-semibold">{order.restaurant_name}</Text>
        <Text variant="caption" tone="faint" as="p">
          {historyLabel} · {new Date(historyDate).toLocaleDateString()}
        </Text>
        {canRate && (
          <div className="mt-1.5">
            <RatingDialog
              orderId={order.id}
              counterpartName={counterpartName}
              onSubmitted={onRated}
            />
          </div>
        )}
      </div>
      <StatusBadge status={order.status} compact />
    </div>
  )
}

export interface HistoryListProps {
  orders: OrderWithProfiles[]
  role: 'requester' | 'deliverer'
  currentUserId: string
  ratedOrderIds: ReadonlySet<string>
  onRated: (orderId: string) => void
  /** Caps how many rows render - the compact preview passes 3; the full
   * history page omits this to show everything already fetched. */
  limit?: number
  emptyMessage: string
  /** Only the preview passes this - the full history page has nothing to link onward to. */
  viewAllHref?: string
}

/**
 * Shared between the compact "History" preview on the active
 * Ordering/Delivering pages and the dedicated OrderingHistory/
 * DeliveringHistory pages - the only difference is `limit` and whether
 * a "View all history" link follows.
 */
export function HistoryList({
  orders,
  role,
  currentUserId,
  ratedOrderIds,
  onRated,
  limit,
  emptyMessage,
  viewAllHref,
}: HistoryListProps) {
  const visible = limit != null ? orders.slice(0, limit) : orders

  if (visible.length === 0) {
    return (
      <Text variant="bodySm" tone="faint" as="p" className="py-4">
        {emptyMessage}
      </Text>
    )
  }

  return (
    <div>
      <div>
        {visible.map((order, i) => (
          <React.Fragment key={order.id}>
            {i > 0 && <Rule />}
            <HistoryRow
              order={order}
              role={role}
              currentUserId={currentUserId}
              canRate={order.status === 'delivered' && !ratedOrderIds.has(order.id)}
              onRated={onRated}
            />
          </React.Fragment>
        ))}
      </div>
      {viewAllHref && (
        <Link
          to={viewAllHref}
          className="mt-3 inline-flex items-center gap-1 font-body text-body-sm font-semibold text-primary-deep underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          View all history →
        </Link>
      )}
    </div>
  )
}
