import React from 'react'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/primitives'

export interface PostingRowData {
  id: string
  restaurant: { name: string }
  items: string
  tip: number
  distance: string
  location: string
  timeAgo: string
}

interface OrderCardProps {
  order: PostingRowData
  onAccept: (orderId: string) => void
  accepting?: boolean
  /**
   * The single dominant opportunity at the top of the board gets the
   * large treatment — display-serif identity, the tip as an oversized
   * numeral, a full-size Take button. Everything else on the board is
   * the compact row. Same ruled, unboxed object either way; only the
   * scale changes, deliberately, per the featured/list split on Home.
   */
  featured?: boolean
}

const OrderCard: React.FC<OrderCardProps> = ({ order, onAccept, accepting = false, featured = false }) => {
  if (featured) {
    return (
      <div className="flex flex-col gap-6 py-2 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <Text variant="dataLg" tone="signalDeep" className="block tabular-nums">
            ₹{order.tip}
          </Text>
          <Text variant="displaySm" as="p" className="mt-2 block">
            {order.items}
          </Text>
          <Text variant="body" tone="muted" className="mt-2 block">
            {order.restaurant.name} → {order.location}
          </Text>
          <Text variant="caption" tone="faint" className="mt-1 block">
            {order.distance} · posted {order.timeAgo}
          </Text>
        </div>

        <Button
          onClick={() => onAccept(order.id)}
          loading={accepting}
          size="lg"
          className="w-full shrink-0 rounded-sm sm:w-auto"
        >
          Take this run
        </Button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[64px_1fr_auto] items-center gap-4 py-3.5 sm:grid-cols-[88px_1fr_auto] sm:gap-5">
      <Text variant="data" tone="signalDeep" className="tabular-nums">
        ₹{order.tip}
      </Text>

      <div className="min-w-0">
        <Text variant="body" className="block font-semibold text-foreground">
          {order.items}
        </Text>
        <Text variant="bodySm" tone="muted" className="mt-0.5 block truncate">
          {order.restaurant.name} → {order.location}
        </Text>
        <Text variant="caption" tone="faint" className="mt-1 block">
          {order.distance} · posted {order.timeAgo}
        </Text>
      </div>

      <Button
        onClick={() => onAccept(order.id)}
        loading={accepting}
        size="sm"
        className="rounded-sm"
      >
        Take
      </Button>
    </div>
  )
}

export default OrderCard
