import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockFetchOrders = vi.fn()
const mockUseOrders = vi.fn()
vi.mock('@/hooks/useOrders', () => ({
  useOrders: () => mockUseOrders(),
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

const { default: OrderingHistory } = await import('./OrderingHistory')

const AUTH_USER = { user: { id: 'customer-1', email: 'a@b.com' }, profile: null , emailVerified: true }

const PAST_ORDER = (overrides = {}) => ({
  id: 'order-1',
  requester_id: 'customer-1',
  deliverer_id: 'deliverer-1',
  restaurant_name: 'One Food',
  items: ['2x Burger'],
  tip_amount: 30,
  delivery_location: { type: 'campus', label: 'TT Block' },
  distance_km: 1.2,
  status: 'delivered',
  created_at: '2026-08-20T10:00:00.000Z',
  cancelled_at: null,
  cancelled_by: null,
  requester_profile: { id: 'customer-1', name: 'Customer Name', phone: '9999999999' },
  deliverer_profile: { id: 'deliverer-1', name: 'Deliverer Name', phone: '8888888888' },
  ...overrides,
})

const useOrdersReturn = (overrides = {}) => ({
  orders: [], loading: false, error: null, fetchOrders: mockFetchOrders, ...overrides,
})

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/activity/ordering/history']}>
      <Routes>
        <Route path="/activity/ordering" element={<div>Ordering Page</div>} />
        <Route path="/activity/ordering/history" element={<OrderingHistory />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ user: AUTH_USER, loading: false })
  mockFetchMyRatedOrderIds.mockResolvedValue(new Set())
})

describe('OrderingHistory - scoping', () => {
  it('fetches the full requester history (no limit), terminal statuses only', () => {
    mockUseOrders.mockReturnValue(useOrdersReturn())
    renderPage()

    expect(mockFetchOrders).toHaveBeenCalledWith({
      mine: { as: 'customer', userId: 'customer-1' },
      statusIn: ['delivered', 'cancelled'],
    })
  })
})

describe('OrderingHistory - rendering', () => {
  it('shows a loading state before the fetch resolves', () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ loading: true }))
    renderPage()
    expect(screen.getByText(/loading history/i)).toBeInTheDocument()
  })

  it('shows an error state', () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ error: 'Network error' }))
    renderPage()
    expect(screen.getByText(/couldn't load your ordering history/i)).toBeInTheDocument()
  })

  it('shows an empty state when there is no history', () => {
    mockUseOrders.mockReturnValue(useOrdersReturn())
    renderPage()
    expect(screen.getByText('No ordering history yet.')).toBeInTheDocument()
  })

  it('shows every historical order, not capped at 3', () => {
    const five = [1, 2, 3, 4, 5].map((n) => PAST_ORDER({ id: `h${n}`, restaurant_name: `Spot ${n}` }))
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: five }))
    renderPage()

    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByText(`Spot ${n}`)).toBeInTheDocument()
    }
  })

  it('shows cancellation attribution for a cancelled historical order', () => {
    const cancelled = PAST_ORDER({
      id: 'h-cancel', status: 'cancelled', cancelled_at: '2026-08-20T10:00:00.000Z', cancelled_by: 'customer-1',
    })
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [cancelled] }))
    renderPage()
    expect(screen.getByText(/^You cancelled ·/)).toBeInTheDocument()
  })

  it('offers a rating prompt for a delivered, unrated order', async () => {
    mockFetchMyRatedOrderIds.mockResolvedValue(new Set())
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [PAST_ORDER()] }))
    renderPage()
    expect(await screen.findByRole('button', { name: /rate this delivery/i })).toBeInTheDocument()
  })

  it('does not offer a rating prompt for an already-rated order', async () => {
    mockFetchMyRatedOrderIds.mockResolvedValue(new Set(['order-1']))
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [PAST_ORDER()] }))
    renderPage()
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole('button', { name: /rate this delivery/i })).not.toBeInTheDocument()
  })

  it('has a back link to the active Ordering page', async () => {
    mockUseOrders.mockReturnValue(useOrdersReturn())
    renderPage()

    await userEvent.click(screen.getByRole('link', { name: /back to ordering/i }))
    expect(await screen.findByText('Ordering Page')).toBeInTheDocument()
  })
})
