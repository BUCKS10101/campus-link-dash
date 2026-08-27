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

const { default: DeliveringHistory } = await import('./DeliveringHistory')

const AUTH_USER = { user: { id: 'customer-1', email: 'a@b.com' }, profile: null }

const PAST_DELIVERY = (overrides = {}) => ({
  id: 'order-2',
  requester_id: 'other-requester',
  deliverer_id: 'customer-1',
  restaurant_name: 'DC Cafe',
  items: ['1x Cold Coffee'],
  tip_amount: 30,
  delivery_location: { type: 'campus', label: 'SJT Block' },
  distance_km: 1.2,
  status: 'delivered',
  created_at: '2026-08-20T10:00:00.000Z',
  cancelled_at: null,
  cancelled_by: null,
  requester_profile: { id: 'other-requester', name: 'Other Requester', phone: '7777777777' },
  deliverer_profile: { id: 'customer-1', name: 'Customer Name', phone: '9999999999' },
  ...overrides,
})

const useOrdersReturn = (overrides = {}) => ({
  orders: [], loading: false, error: null, fetchOrders: mockFetchOrders, ...overrides,
})

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/activity/delivering/history']}>
      <Routes>
        <Route path="/activity/delivering" element={<div>Delivering Page</div>} />
        <Route path="/activity/delivering/history" element={<DeliveringHistory />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ user: AUTH_USER, loading: false })
  mockFetchMyRatedOrderIds.mockResolvedValue(new Set())
})

describe('DeliveringHistory - scoping', () => {
  it('fetches the full deliverer history (no limit), terminal statuses only', () => {
    mockUseOrders.mockReturnValue(useOrdersReturn())
    renderPage()

    expect(mockFetchOrders).toHaveBeenCalledWith({
      mine: { as: 'deliverer', userId: 'customer-1' },
      statusIn: ['delivered', 'cancelled'],
    })
  })
})

describe('DeliveringHistory - rendering', () => {
  it('shows a loading state before the fetch resolves', () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ loading: true }))
    renderPage()
    expect(screen.getByText(/loading history/i)).toBeInTheDocument()
  })

  it('shows an error state', () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ error: 'Network error' }))
    renderPage()
    expect(screen.getByText(/couldn't load your delivering history/i)).toBeInTheDocument()
  })

  it('shows an empty state when there is no history', () => {
    mockUseOrders.mockReturnValue(useOrdersReturn())
    renderPage()
    expect(screen.getByText('No delivery history yet.')).toBeInTheDocument()
  })

  it('shows every historical delivery, not capped at 3', () => {
    const five = [1, 2, 3, 4, 5].map((n) => PAST_DELIVERY({ id: `h${n}`, restaurant_name: `Spot ${n}` }))
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: five }))
    renderPage()

    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByText(`Spot ${n}`)).toBeInTheDocument()
    }
  })

  it('shows cancellation attribution for a cancelled historical delivery', () => {
    const cancelled = PAST_DELIVERY({
      id: 'h-cancel', status: 'cancelled', cancelled_at: '2026-08-20T10:00:00.000Z', cancelled_by: 'other-requester',
    })
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [cancelled] }))
    renderPage()
    expect(screen.getByText(/^They cancelled ·/)).toBeInTheDocument()
  })

  it('has a back link to the active Delivering page', async () => {
    mockUseOrders.mockReturnValue(useOrdersReturn())
    renderPage()

    await userEvent.click(screen.getByRole('link', { name: /back to delivering/i }))
    expect(await screen.findByText('Delivering Page')).toBeInTheDocument()
  })
})
