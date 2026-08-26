import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/primitives'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/hooks/useNotifications'
import { formatNotificationText } from '@/lib/notificationContent'
import type { NotificationWithOrder } from '@/lib/database-types'

const timeAgo = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.round(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

const NotificationRow = ({
  notification,
  onOpen,
}: {
  notification: NotificationWithOrder
  onOpen: (notification: NotificationWithOrder) => void
}) => {
  const unread = notification.read_at == null
  const restaurantName = notification.order?.restaurant_name ?? 'your order'

  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-3 text-left',
        'transition-colors duration-fast ease-out hover:bg-surface-sunken',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('mt-1.5 size-2 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-transparent')}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Text variant="bodySm" className={cn(unread && 'font-semibold')}>
          {formatNotificationText(notification.type, restaurantName)}
          {unread && <span className="sr-only"> (Unread)</span>}
        </Text>
        <Text variant="caption" tone="faint">
          {timeAgo(notification.created_at)}
        </Text>
      </span>
    </button>
  )
}

/**
 * The shared list contents - rendered inside a Popover (desktop) or a
 * Sheet (mobile) by the two callers below. Deliberately small: a capped
 * list, an empty state, "Mark all read" - no dashboard chrome.
 */
export function NotificationsList({ onNavigate }: { onNavigate?: () => void }) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const navigate = useNavigate()

  const handleOpen = (notification: NotificationWithOrder) => {
    if (notification.read_at == null) void markRead(notification.id)
    navigate(`/my-orders?order=${notification.order_id}`)
    onNavigate?.()
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 pb-3">
        <Text variant="label" tone="faint" as="div">
          Notifications
        </Text>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" className="h-auto p-0 text-body-sm font-medium" onClick={() => void markAllRead()}>
            Mark all read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <Text variant="bodySm" tone="muted">
            Nothing yet.
          </Text>
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto border-t border-border">
          {notifications.map((n) => (
            <NotificationRow key={n.id} notification={n} onOpen={handleOpen} />
          ))}
        </div>
      )}
    </div>
  )
}
