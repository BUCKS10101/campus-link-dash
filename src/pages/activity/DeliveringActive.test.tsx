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
const mockUpdateOrderStatus = vi.fn()
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

const { default: DeliveringActive } = await import('./DeliveringActive')

const AUTH_USER = { user: { id: 'customer-1', email: 'a@b.com' }, profile: null , emailVerified: true }

const CARRYING_ORDER = {
  id: 'order-2',
  requester_id: 'other-requester',
  deliverer_id: 'customer-1',
  restaurant_name: 'DC Cafe',
  items: ['1x Cold Coffee'],
  tip_amount: 30,
  delivery_location: { type: 'hostel', label: 'Ladies Hostel C', hostelType: 'ladies', block: 'C' },
  distance_km: 1.2,
  status: 'accepted',
  created_at: new Date().toISOString(),
  cancelled_at: null,
  cancelled_by: null,
  requester_profile: { id: 'other-requester', name: 'Other Requester', phone: '7777777777' },
  deliverer_profile: { id: 'customer-1', name: 'Customer Name', phone: '9999999999' },
}

const HISTORICAL_ORDER = (overrides = {}) => ({
  ...CARRYING_ORDER,
  id: 'order-hist-2',
  status: 'delivered',
  ...overrides,
})

const stubOrdersHooks = ({
  activeOrders = [] as unknown[],
  historyOrders = [] as unknown[],
  activeLoading = false,
  activeError = null as string | null,
} = {}) => {
  const activeStub = {
    orders: activeOrders, loading: activeLoading, error: activeError, fetchOrders: mockFetchOrders,
    cancelOrder: mockCancelOrder, getMyOrderOtp: mockGetMyOrderOtp, verifyDeliveryOtp: mockVerifyDeliveryOtp,
    updateOrderStatus: mockUpdateOrderStatus, computeWalkingRoute: vi.fn(), computeWalkingRouteCustom: vi.fn(),
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

const renderPage = (initialPath = '/activity/delivering') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/activity/delivering" element={<DeliveringActive />} />
        <Route path="/activity/delivering/history" element={<div>Delivering History Page</div>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ user: AUTH_USER, loading: false })
  mockFetchMyRatedOrderIds.mockResolvedValue(new Set())
})

describe('DeliveringActive - deliverer scoping', () => {
  it('fetches active deliveries scoped to this user as deliverer, with ACTIVE_STATUSES', () => {
    stubOrdersHooks()
    renderPage()

    expect(mockFetchOrders).toHaveBeenCalledWith({
      mine: { as: 'deliverer', userId: 'customer-1' },
      statusIn: ['pending', 'accepted', 'picked_up', 'out_for_delivery'],
    })
  })

  it('fetches the history preview scoped to this user as deliverer, terminal statuses, capped at 3', () => {
    stubOrdersHooks()
    renderPage()

    expect(mockFetchOrders).toHaveBeenCalledWith({
      mine: { as: 'deliverer', userId: 'customer-1' },
      statusIn: ['delivered', 'cancelled'],
      limit: 3,
    })
  })
})

describe('DeliveringActive - active deliveries', () => {
  it('shows a loading state before the first fetch resolves', () => {
    stubOrdersHooks({ activeLoading: true })
    renderPage()
    expect(screen.getByText(/loading activity/i)).toBeInTheDocument()
  })

  it('shows an error state with a retry action', () => {
    stubOrdersHooks({ activeError: 'Network error' })
    renderPage()
    expect(screen.getByText(/couldn't load your deliveries/i)).toBeInTheDocument()
  })

  it("shows 'Nothing active.' and a browse-the-board CTA when there are no active deliveries", () => {
    stubOrdersHooks()
    renderPage()
    expect(screen.getByText('Nothing active.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /browse the board/i })).toHaveAttribute('href', '/')
  })

  it('renders an active carried order with its real fields', () => {
    stubOrdersHooks({ activeOrders: [CARRYING_ORDER] })
    renderPage()

    expect(screen.getByText('1x Cold Coffee')).toBeInTheDocument()
    expect(screen.getByText('Other Requester')).toBeInTheDocument()
  })

  it('lets the deliverer advance a non-OTP status transition', async () => {
    stubOrdersHooks({ activeOrders: [CARRYING_ORDER] }) // status: accepted
    mockUpdateOrderStatus.mockResolvedValue({ ...CARRYING_ORDER, status: 'picked_up' })
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /mark picked up/i }))
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-2', 'picked_up', 'customer-1')
  })

  it('lets the deliverer cancel while accepted', async () => {
    stubOrdersHooks({ activeOrders: [CARRYING_ORDER] })
    mockCancelOrder.mockResolvedValue({ ...CARRYING_ORDER, status: 'cancelled' })
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /can't complete this/i }))
    await userEvent.click(screen.getByRole('button', { name: /^cancel delivery$/i }))

    await waitFor(() => expect(mockCancelOrder).toHaveBeenCalledWith('order-2', 'deliverer', 'customer-1'))
  })

  it('does not offer deliverer cancellation once picked up', () => {
    stubOrdersHooks({ activeOrders: [{ ...CARRYING_ORDER, status: 'picked_up' }] })
    renderPage()
    expect(screen.queryByRole('button', { name: /can't complete this/i })).not.toBeInTheDocument()
  })

  it('never shows a requester-only order (this user is not the deliverer)', () => {
    // Scoping is enforced by the fetch itself (as: 'deliverer') - this
    // just confirms nothing renders when the active fetch is empty
    // (the fetch would never even return a requester-only order).
    stubOrdersHooks({ activeOrders: [] })
    renderPage()
    expect(screen.getByText('Nothing active.')).toBeInTheDocument()
  })
})

describe('DeliveringActive - history preview', () => {
  it('shows an empty-history message when there is no history yet', () => {
    stubOrdersHooks()
    renderPage()
    expect(screen.getByText('No delivery history yet.')).toBeInTheDocument()
  })

  it('shows only the latest 3 history rows and a "View all history" link', () => {
    const four = [1, 2, 3, 4].map((n) => HISTORICAL_ORDER({ id: `h${n}`, restaurant_name: `Spot ${n}` }))
    stubOrdersHooks({ historyOrders: four })
    renderPage()

    expect(screen.getByText('Spot 1')).toBeInTheDocument()
    expect(screen.getByText('Spot 3')).toBeInTheDocument()
    expect(screen.queryByText('Spot 4')).not.toBeInTheDocument()

    expect(screen.getByRole('link', { name: /view all history/i })).toHaveAttribute('href', '/activity/delivering/history')
  })

  it('"View all history" navigates to the Delivering History route', async () => {
    stubOrdersHooks({ historyOrders: [HISTORICAL_ORDER()] })
    renderPage()

    await userEvent.click(screen.getByRole('link', { name: /view all history/i }))
    expect(await screen.findByText('Delivering History Page')).toBeInTheDocument()
  })
})

describe('DeliveringActive - deep link', () => {
  it('expands the order named in ?order= if it is in the active list', () => {
    const other = {
      ...CARRYING_ORDER, id: 'order-3', restaurant_name: 'Other Spot', items: ['1x notebook'],
    }
    stubOrdersHooks({ activeOrders: [other, CARRYING_ORDER] })
    renderPage('/activity/delivering?order=order-2')

    expect(screen.getByText('1x Cold Coffee')).toBeInTheDocument()
  })
})
