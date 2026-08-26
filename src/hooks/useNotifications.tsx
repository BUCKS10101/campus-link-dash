import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Notification, NotificationWithOrder } from '@/lib/database-types'

const NOTIFICATION_COLUMNS = `
  id, recipient_id, type, order_id, friendship_id, read_at, created_at,
  order:orders(restaurant_name),
  friendship:friendships(
    requester_id, addressee_id,
    requester_profile:profiles!friendships_requester_id_fkey(name),
    addressee_profile:profiles!friendships_addressee_id_fkey(name)
  )
`

// Simple capped list, not true infinite scroll - see
// PHASE3_3C_NOTIFICATIONS_SPEC.md §13/§18.
const PAGE_SIZE = 20

const byRecency = (a: NotificationWithOrder, b: NotificationWithOrder) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime()

interface NotificationsContextValue {
  notifications: NotificationWithOrder[]
  unreadCount: number
  loading: boolean
  hasMore: boolean
  loadMore: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  /** Called by ChatThread on mount/new-message while that order's thread is open - see spec §11. */
  markOrderChatRead: (orderId: string) => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.user.id ?? null

  const [notifications, setNotifications] = useState<NotificationWithOrder[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    if (!userId) {
      setNotifications([])
      setUnreadCount(0)
      setHasMore(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const load = async () => {
      const [{ data: rows }, { count }] = await Promise.all([
        supabase
          .from('notifications')
          .select(NOTIFICATION_COLUMNS)
          .eq('recipient_id', userId)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE),
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_id', userId)
          .is('read_at', null),
      ])
      if (cancelled) return
      const list = (rows ?? []) as unknown as NotificationWithOrder[]
      setNotifications(list)
      setUnreadCount(count ?? 0)
      setHasMore(list.length === PAGE_SIZE)
      setLoading(false)
    }
    void load()

    // One user-scoped realtime channel, mounted once here (not per-page,
    // not per-order) - see spec §10. Own writes (markRead/markAllRead
    // below) are reflected back through this same channel rather than
    // updated optimistically, the same idiom useChat.ts already uses for
    // sendMessage.
    const channel = supabase
      .channel(`notifications:recipient_id=eq.${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const inserted = payload.new as Notification
          supabase
            .from('notifications')
            .select(NOTIFICATION_COLUMNS)
            .eq('id', inserted.id)
            .single()
            .then(({ data }) => {
              if (!data) return
              const row = data as unknown as NotificationWithOrder
              setNotifications((prev) => [row, ...prev.filter((n) => n.id !== row.id)].slice(0, PAGE_SIZE))
              setUnreadCount((c) => c + 1)
            })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const oldRow = payload.old as Notification
          const newRow = payload.new as Notification

          setNotifications((prev) =>
            prev
              .map((n) => (n.id === newRow.id ? { ...n, read_at: newRow.read_at, created_at: newRow.created_at } : n))
              .sort(byRecency),
          )

          // A chat notification upsert (spec §7) both resets read_at to
          // null AND bumps created_at on the same row - it must register
          // as exactly one unread delta, not two.
          if (oldRow.read_at == null && newRow.read_at != null) {
            setUnreadCount((c) => Math.max(0, c - 1))
          } else if (oldRow.read_at != null && newRow.read_at == null) {
            setUnreadCount((c) => c + 1)
          }
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [userId])

  const loadMore = async () => {
    if (!userId || notifications.length === 0) return
    const last = notifications[notifications.length - 1]
    const { data } = await supabase
      .from('notifications')
      .select(NOTIFICATION_COLUMNS)
      .eq('recipient_id', userId)
      .lt('created_at', last.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    const more = (data ?? []) as unknown as NotificationWithOrder[]
    setNotifications((prev) => [...prev, ...more])
    setHasMore(more.length === PAGE_SIZE)
  }

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
  }

  const markAllRead = async () => {
    if (!userId) return
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', userId)
      .is('read_at', null)
  }

  const markOrderChatRead = async (orderId: string) => {
    if (!userId) return
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', userId)
      .eq('order_id', orderId)
      .eq('type', 'new_chat_message')
      .is('read_at', null)
  }

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, loading, hasMore, loadMore, markRead, markAllRead, markOrderChatRead }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}

export const useNotifications = () => {
  const ctx = useContext(NotificationsContext)
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationsProvider')
  }
  return ctx
}
