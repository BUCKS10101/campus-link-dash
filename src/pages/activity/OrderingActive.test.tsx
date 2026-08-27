import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockFetchOrders = vi.fn()
const mockSubscribeToOrders = vi.fn(() => vi.fn())
const mockCancelOrder = vi.fn()
const mockGetMyOrderOtp = vi.fn()
const mockVerifyDeliveryOtp = vi.fn()
const mockUseOrders = vi.fn()
vi.mock('@/hooks/useOrders', () => ({
  useOrders: () => mockUseOrders(),
}))

vi.mock('@/hooks/useChat', () => ({
  useChat: () => ({ messages: [], loading: false, error: null, sendMessage: vi.fn() }),
}))

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: [], unreadCount: 0, loading: false, hasMore: false,
    loadMore: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(), markOrderChatRead: vi.fn(),
  }),
}))

const mockFetchMyRatedOrderIds = vi.fn()
vi.mock('@/hooks/useRatings', () => ({
  useRatings: () => ({
    submitting: false,
    submitRating: vi.fn(),
    fetchMyRatedOrderIds: mockFetchMyRatedOrderIds,
    getProfileReputation: vi.fn(),
  }),
}))

const { default: OrderingActive } = await import('./OrderingActive')

const AUTH_USER = { user: { id: 'customer-1', email: 'a@b.com' }, profile: null }

const ACTIVE_ORDER = {
  id: 'order-1',
  requester_id: 'customer-1',
  deliverer_id: 'deliverer-1',
  restaurant_name: 'One Food',
  items: ['2x Burger'],
  tip_amount: 30,
  delivery_location: { type: 'hostel', label: "Men's Hostel K", hostelType: 'mens', block: 'K' },
  distance_km: 1.2,
  status: 'picked_up',
  created_at: new Date().toISOString(),
  cancelled_at: null,
  cancelled_by: null,
  requester_profile: { id: 'customer-1', name: 'Customer Name', phone: '9999999999' },
  deliverer_profile: { id: 'deliverer-1', name: 'Deliverer Name', phone: '8888888888' },
}

const HISTORICAL_ORDER = (overrides = {}) => ({
  ...ACTIVE_ORDER,
  id: 'order-hist-1',
  status: 'delivered',
  ...overrides,
})

/** OrderingActive calls useOrders() twice per render: once for the
 * active fetch, once for the history preview. Every render re-invokes
 * both, in the same fixed order, so a call-count parity check (rather
 * than mockImplementationOnce, which only survives a single call total)
 * keeps returning the right stub across every re-render a test triggers. */
const stubOrdersHooks = ({
  activeOrders = [] as unknown[],
  historyOrders = [] as unknown[],
  activeLoading = false,
  activeError = null as string | null,
} = {}) => {
  const activeStub = {
    orders: activeOrders, loading: activeLoading, error: activeError, fetchOrders: mockFetchOrders,
    cancelOrder: mockCancelOrder, getMyOrderOtp: mockGetMyOrderOtp, verifyDeliveryOtp: mockVerifyDeliveryOtp,
    updateOrderStatus: vi.fn(), computeWalkingRoute: vi.fn(), computeWalkingRouteCustom: vi.fn(),
    subscribeToOrders: mockSubscribeToOrders,
  }
  const historyStub = {
    orders: historyOrders, loading: false, error: null, fetchOrders: mockFetchOrders,
    cancelOrder: vi.fn(), getMyOrderOtp: vi.fn(), verifyDeliveryOtp: vi.fn(),
    updateOrderStatus: vi.fn(), computeWalkingRoute: vi.fn(), computeWalkingRouteCustom: vi.fn(),
    subscribeToOrders: vi.fn(() => vi.fn()),
  }
  let callCount = 0
  mockUseOrders.mockImplementation(() => {
    callCount += 1
    return callCount % 2 === 1 ? activeStub : historyStub
  })
}

const renderPage = (initialPath = '/activity/ordering') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/activity/ordering" element={<OrderingActive />} />
        <Route path="/activity/ordering/history" element={<div>Ordering History Page</div>} />
      </Routes>
    </MemoryRouter>,
  )

const otpSlipText = () => screen.getByRole('status').textContent?.trim()

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ user: AUTH_USER, loading: false })
  mockFetchMyRatedOrderIds.mockResolvedValue(new Set())
})

describe('OrderingActive - requester scoping', () => {
  it('fetches active orders scoped to this user as customer, with ACTIVE_STATUSES', () => {
    stubOrdersHooks()
    renderPage()

    expect(mockFetchOrders).toHaveBeenCalledWith({
      mine: { as: 'customer', userId: 'customer-1' },
      statusIn: ['pending', 'accepted', 'picked_up', 'out_for_delivery'],
    })
  })

  it('fetches the history preview scoped to this user as customer, terminal statuses, capped at 3', () => {
    stubOrdersHooks()
    renderPage()

    expect(mockFetchOrders).toHaveBeenCalledWith({
      mine: { as: 'customer', userId: 'customer-1' },
      statusIn: ['delivered', 'cancelled'],
      limit: 3,
    })
  })
})

describe('OrderingActive - active orders', () => {
  it('shows a loading state before the first fetch resolves', () => {
    stubOrdersHooks({ activeLoading: true })
    renderPage()
    expect(screen.getByText(/loading activity/i)).toBeInTheDocument()
  })

  it('shows an error state with a retry action', () => {
    stubOrdersHooks({ activeError: 'Network error' })
    renderPage()
    expect(screen.getByText(/couldn't load your orders/i)).toBeInTheDocument()
    expect(screen.getByText(/network error/i)).toBeInTheDocument()
  })

  it("shows 'Nothing active.' and a post-a-request CTA when there are no active orders", () => {
    stubOrdersHooks()
    renderPage()
    expect(screen.getByText('Nothing active.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /post a request/i })).toHaveAttribute('href', '/post-request')
  })

  it('renders an active requested order with its real fields', async () => {
    stubOrdersHooks({ activeOrders: [ACTIVE_ORDER] })
    mockGetMyOrderOtp.mockResolvedValue('123456')
    renderPage()

    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    expect(screen.getAllByText('Deliverer Name').length).toBeGreaterThan(0)
    await waitFor(() => expect(otpSlipText()).toBe('1 2 3 4 5 6'))
  })

  it('lets the requester cancel a pending/accepted order', async () => {
    const pending = { ...ACTIVE_ORDER, status: 'pending', deliverer_id: null, deliverer_profile: null }
    stubOrdersHooks({ activeOrders: [pending] })
    mockCancelOrder.mockResolvedValue({ ...pending, status: 'cancelled' })
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /cancel this request/i }))
    await userEvent.click(screen.getByRole('button', { name: /^cancel request$/i }))

    await waitFor(() => expect(mockCancelOrder).toHaveBeenCalledWith('order-1', 'requester', 'customer-1'))
  })

  it('does not offer cancellation once picked up', () => {
    stubOrdersHooks({ activeOrders: [ACTIVE_ORDER] }) // status: picked_up
    mockGetMyOrderOtp.mockResolvedValue('123456')
    renderPage()
    expect(screen.queryByRole('button', { name: /cancel this request/i })).not.toBeInTheDocument()
  })

  it('never offers a deliverer-only "mark picked up" action to the requester', () => {
    const accepted = { ...ACTIVE_ORDER, status: 'accepted' }
    stubOrdersHooks({ activeOrders: [accepted] })
    renderPage()
    expect(screen.queryByRole('button', { name: /mark picked up/i })).not.toBeInTheDocument()
  })
})

describe('OrderingActive - history preview', () => {
  it('shows an empty-history message when there is no history yet', () => {
    stubOrdersHooks()
    renderPage()
    expect(screen.getByText('No ordering history yet.')).toBeInTheDocument()
  })

  it('shows only the latest 3 history rows even if more are somehow returned, and a "View all history" link', () => {
    const four = [1, 2, 3, 4].map((n) => HISTORICAL_ORDER({ id: `h${n}`, restaurant_name: `Spot ${n}` }))
    stubOrdersHooks({ historyOrders: four })
    renderPage()

    expect(screen.getByText('Spot 1')).toBeInTheDocument()
    expect(screen.getByText('Spot 2')).toBeInTheDocument()
    expect(screen.getByText('Spot 3')).toBeInTheDocument()
    expect(screen.queryByText('Spot 4')).not.toBeInTheDocument()

    const link = screen.getByRole('link', { name: /view all history/i })
    expect(link).toHaveAttribute('href', '/activity/ordering/history')
  })

  it('"View all history" navigates to the Ordering History route', async () => {
    stubOrdersHooks({ historyOrders: [HISTORICAL_ORDER()] })
    renderPage()

    await userEvent.click(screen.getByRole('link', { name: /view all history/i }))
    expect(await screen.findByText('Ordering History Page')).toBeInTheDocument()
  })

  it('never shows a delivered/cancelled order in the active list', () => {
    stubOrdersHooks({ activeOrders: [], historyOrders: [HISTORICAL_ORDER({ restaurant_name: 'Past Place' })] })
    renderPage()
    // "Past Place" only appears once, under History - never duplicated
    // into the active section (which is empty here).
    expect(screen.getAllByText('Past Place')).toHaveLength(1)
    expect(screen.getByText('Nothing active.')).toBeInTheDocument()
  })
})

describe('OrderingActive - deep link', () => {
  it('expands the order named in ?order= if it is in the active list', () => {
    const other = {
      ...ACTIVE_ORDER, id: 'order-2', status: 'pending', deliverer_id: null, deliverer_profile: null,
      restaurant_name: 'Other Spot', items: ['1x notebook'],
    }
    stubOrdersHooks({ activeOrders: [other, ACTIVE_ORDER] })
    mockGetMyOrderOtp.mockResolvedValue('123456')
    renderPage('/activity/ordering?order=order-1')

    // order-1 (ACTIVE_ORDER, picked_up) is the one deep-linked, not the
    // first-in-list default - its OTP-eligible detail should be open.
    expect(screen.getByText('2x Burger')).toBeInTheDocument()
  })
})
