import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { createElement } from 'react'
import { createQueryBuilder, createSupabaseMock } from '@/test/supabaseMock'

const supabaseMock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return supabaseMock
  },
}))

const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const { useNotifications, NotificationsProvider } = await import('./useNotifications')

const wrapper = ({ children }: { children: React.ReactNode }) => createElement(NotificationsProvider, null, children)

type Handler = (payload: { new?: unknown; old?: unknown }) => void

/** Captures the INSERT/UPDATE callbacks registered on the one notifications channel, keyed by event type. */
function makeChannelMock() {
  const handlers: Record<string, Handler> = {}
  const channel = {
    on: vi.fn((_type: string, config: { event: string }, cb: Handler) => {
      handlers[config.event] = cb
      return channel
    }),
    subscribe: vi.fn().mockReturnThis(),
  }
  return { channel, handlers }
}

const NOTIFICATION_1 = {
  id: 'n1',
  recipient_id: 'u1',
  type: 'order_accepted',
  order_id: 'order-1',
  read_at: null,
  created_at: '2026-08-26T10:00:00.000Z',
  order: { restaurant_name: 'One Food World' },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NotificationsProvider - no user signed in', () => {
  it('fetches nothing and never opens a realtime channel', async () => {
    mockUseAuth.mockReturnValue({ user: null })
    const { result } = renderHook(() => useNotifications(), { wrapper })

    expect(result.current.notifications).toEqual([])
    expect(result.current.unreadCount).toBe(0)
    expect(supabaseMock.channel).not.toHaveBeenCalled()
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })
})

describe('NotificationsProvider - signed in', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: { user: { id: 'u1' } } })
  })

  it('loads the capped list and the unread count on mount, via one user-scoped channel', async () => {
    const { channel } = makeChannelMock()
    supabaseMock.channel.mockReturnValue(channel)
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: [NOTIFICATION_1], error: null, count: 1 }))

    const { result } = renderHook(() => useNotifications(), { wrapper })

    await waitFor(() => expect(result.current.notifications).toHaveLength(1))
    expect(result.current.unreadCount).toBe(1)
    expect(supabaseMock.channel).toHaveBeenCalledTimes(1)
    expect(supabaseMock.channel).toHaveBeenCalledWith('notifications:recipient_id=eq.u1')
  })

  it('an INSERT event fetches the joined row and prepends it, incrementing unread count', async () => {
    const { channel, handlers } = makeChannelMock()
    supabaseMock.channel.mockReturnValue(channel)
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: [], error: null, count: 0 }))

    const { result } = renderHook(() => useNotifications(), { wrapper })
    await waitFor(() => expect(result.current.unreadCount).toBe(0))

    const inserted = { ...NOTIFICATION_1, id: 'n2' }
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: inserted, error: null }))

    await act(async () => {
      handlers.INSERT({ new: { id: 'n2' } })
    })

    await waitFor(() => expect(result.current.notifications.map((n) => n.id)).toContain('n2'))
    expect(result.current.unreadCount).toBe(1)
  })

  it('an UPDATE marking a row read decrements unread count without duplicating rows', async () => {
    const { channel, handlers } = makeChannelMock()
    supabaseMock.channel.mockReturnValue(channel)
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: [NOTIFICATION_1], error: null, count: 1 }))

    const { result } = renderHook(() => useNotifications(), { wrapper })
    await waitFor(() => expect(result.current.unreadCount).toBe(1))

    act(() => {
      handlers.UPDATE({
        old: { ...NOTIFICATION_1, read_at: null },
        new: { ...NOTIFICATION_1, read_at: '2026-08-26T11:00:00.000Z' },
      })
    })

    expect(result.current.unreadCount).toBe(0)
    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0].read_at).toBe('2026-08-26T11:00:00.000Z')
  })

  it('a chat re-alert UPDATE (read_at reset to null, same row) increments unread count exactly once, not twice', async () => {
    const alreadyRead = { ...NOTIFICATION_1, type: 'new_chat_message', read_at: '2026-08-26T10:30:00.000Z' }
    const { channel, handlers } = makeChannelMock()
    supabaseMock.channel.mockReturnValue(channel)
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: [alreadyRead], error: null, count: 0 }))

    const { result } = renderHook(() => useNotifications(), { wrapper })
    await waitFor(() => expect(result.current.notifications).toHaveLength(1))
    expect(result.current.unreadCount).toBe(0)

    act(() => {
      handlers.UPDATE({
        old: alreadyRead,
        new: { ...alreadyRead, read_at: null, created_at: '2026-08-26T12:00:00.000Z' },
      })
    })

    expect(result.current.unreadCount).toBe(1)
    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0].read_at).toBeNull()
  })

  it('markAllRead updates every unread row scoped to this recipient', async () => {
    const { channel } = makeChannelMock()
    supabaseMock.channel.mockReturnValue(channel)
    const builder = createQueryBuilder({ data: [], error: null, count: 0 })
    supabaseMock.from.mockReturnValue(builder)

    const { result } = renderHook(() => useNotifications(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.markAllRead()
    })

    expect(builder.update).toHaveBeenCalledWith({ read_at: expect.any(String) })
    expect(builder.eq).toHaveBeenCalledWith('recipient_id', 'u1')
    expect(builder.is).toHaveBeenCalledWith('read_at', null)
  })

  it('markOrderChatRead scopes to this recipient, this order, and the chat type only', async () => {
    const { channel } = makeChannelMock()
    supabaseMock.channel.mockReturnValue(channel)
    const builder = createQueryBuilder({ data: [], error: null, count: 0 })
    supabaseMock.from.mockReturnValue(builder)

    const { result } = renderHook(() => useNotifications(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.markOrderChatRead('order-9')
    })

    expect(builder.eq).toHaveBeenCalledWith('order_id', 'order-9')
    expect(builder.eq).toHaveBeenCalledWith('type', 'new_chat_message')
  })

  it('unsubscribes the channel on unmount', async () => {
    const { channel } = makeChannelMock()
    supabaseMock.channel.mockReturnValue(channel)
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: [], error: null, count: 0 }))

    const { unmount } = renderHook(() => useNotifications(), { wrapper })
    await waitFor(() => expect(supabaseMock.channel).toHaveBeenCalled())

    unmount()
    expect(supabaseMock.removeChannel).toHaveBeenCalledWith(channel)
  })
})
