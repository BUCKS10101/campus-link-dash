import * as React from 'react'
import { Bell } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { IconButton } from '@/components/primitives'
import { useIsMobile } from '@/hooks/use-mobile'
import { useNotifications } from '@/hooks/useNotifications'
import { formatUnreadCount } from '@/lib/notificationContent'
import { NotificationsList } from './NotificationsPanel'

/**
 * Desktop gets a Popover, mobile gets a bottom Sheet - same split
 * WhereFilter already established for this app (see PHASE3_3B). One
 * shared trigger component so DesktopNav and the mobile header can't
 * drift out of sync on behavior.
 */
export function NotificationBell() {
  const isMobile = useIsMobile()
  const { unreadCount } = useNotifications()
  const [open, setOpen] = React.useState(false)

  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'

  const trigger = (
    <IconButton label={label} variant="ghost" className="relative">
      <Bell />
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-data text-[10px] font-semibold leading-none tabular-nums text-primary-foreground"
        >
          {formatUnreadCount(unreadCount)}
        </span>
      )}
    </IconButton>
  )

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-md p-0">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle className="text-left font-display">Notifications</SheetTitle>
          </SheetHeader>
          <NotificationsList onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="pt-3">
          <NotificationsList onNavigate={() => setOpen(false)} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
