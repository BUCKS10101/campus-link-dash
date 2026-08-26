import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockMarkRead = vi.fn()
const mockMarkAllRead = vi.fn()
const mockUseNotifications = vi.fn()
vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => mockUseNotifications(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const { NotificationBell } = await import('./NotificationBell')

const NOTIFICATION = {
  id: 'n1',
  recipient_id: 'u1',
  type: 'order_accepted' as const,
  order_id: 'order-1',
  friendship_id: null,
  read_at: null,
  created_at: new Date().toISOString(),
  order: { restaurant_name: 'One Food World' },
  friendship: null,
}

const baseState = {
  notifications: [] as typeof NOTIFICATION[],
  unreadCount: 0,
  loading: false,
  hasMore: false,
  loadMore: vi.fn(),
  markRead: mockMarkRead,
  markAllRead: mockMarkAllRead,
  markOrderChatRead: vi.fn(),
}

const renderBell = () => render(<MemoryRouter><NotificationBell /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NotificationBell', () => {
  it('shows no badge when there is nothing unread', () => {
    mockUseNotifications.mockReturnValue({ ...baseState })
    renderBell()
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument()
    expect(screen.queryByText(/\d/)).not.toBeInTheDocument()
  })

  it('shows the exact unread count in the badge and the accessible label', () => {
    mockUseNotifications.mockReturnValue({ ...baseState, unreadCount: 3, notifications: [NOTIFICATION] })
    renderBell()
    expect(screen.getByLabelText('Notifications, 3 unread')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('caps the badge at "9+" instead of a large multi-digit number', () => {
    mockUseNotifications.mockReturnValue({ ...baseState, unreadCount: 42 })
    renderBell()
    expect(screen.getByText('9+')).toBeInTheDocument()
    expect(screen.queryByText('42')).not.toBeInTheDocument()
  })

  it('opens the panel on click and shows the empty state when there are no notifications', async () => {
    mockUseNotifications.mockReturnValue({ ...baseState })
    renderBell()
    await userEvent.click(screen.getByLabelText('Notifications'))
    expect(await screen.findByText('Nothing yet.')).toBeInTheDocument()
  })

  it('shows an unread notification in bold with a non-color-only unread signal, and marks it read + navigates on click', async () => {
    mockUseNotifications.mockReturnValue({ ...baseState, unreadCount: 1, notifications: [NOTIFICATION] })
    renderBell()
    await userEvent.click(screen.getByLabelText('Notifications, 1 unread'))

    const row = await screen.findByText('Someone accepted your One Food World order.')
    expect(row).toHaveClass('font-semibold')
    expect(screen.getByText('(Unread)')).toBeInTheDocument()

    await userEvent.click(row)
    expect(mockMarkRead).toHaveBeenCalledWith('n1')
    expect(mockNavigate).toHaveBeenCalledWith('/my-orders?order=order-1')
  })

  it('does not re-mark an already-read notification as read on click', async () => {
    const read = { ...NOTIFICATION, read_at: new Date().toISOString() }
    mockUseNotifications.mockReturnValue({ ...baseState, notifications: [read] })
    renderBell()
    await userEvent.click(screen.getByLabelText('Notifications'))

    const row = await screen.findByText('Someone accepted your One Food World order.')
    await userEvent.click(row)
    expect(mockMarkRead).not.toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/my-orders?order=order-1')
  })

  it('offers "Mark all read" only when something is unread, and calls it on click', async () => {
    mockUseNotifications.mockReturnValue({ ...baseState, unreadCount: 1, notifications: [NOTIFICATION] })
    renderBell()
    await userEvent.click(screen.getByLabelText('Notifications, 1 unread'))

    const button = await screen.findByText('Mark all read')
    await userEvent.click(button)
    expect(mockMarkAllRead).toHaveBeenCalled()
  })

  it('hides "Mark all read" when nothing is unread', async () => {
    mockUseNotifications.mockReturnValue({ ...baseState, notifications: [{ ...NOTIFICATION, read_at: new Date().toISOString() }] })
    renderBell()
    await userEvent.click(screen.getByLabelText('Notifications'))
    await screen.findByText('Someone accepted your One Food World order.')
    expect(screen.queryByText('Mark all read')).not.toBeInTheDocument()
  })

  it('a friend-request notification (order_id null) deep-links to /friends, not a random page (Phase 3E)', async () => {
    const friendNotification = {
      id: 'n2',
      recipient_id: 'u1',
      type: 'friend_request_received' as const,
      order_id: null,
      friendship_id: 'friendship-1',
      read_at: null,
      created_at: new Date().toISOString(),
      order: null,
      friendship: {
        requester_id: 'someone-else',
        addressee_id: 'u1',
        requester_profile: { name: 'Alice' },
        addressee_profile: { name: 'Me' },
      },
    }
    mockUseNotifications.mockReturnValue({ ...baseState, unreadCount: 1, notifications: [friendNotification] })
    renderBell()
    await userEvent.click(screen.getByLabelText('Notifications, 1 unread'))

    const row = await screen.findByText('Alice sent you a friend request.')
    await userEvent.click(row)
    expect(mockMarkRead).toHaveBeenCalledWith('n2')
    expect(mockNavigate).toHaveBeenCalledWith('/friends')
  })
})
