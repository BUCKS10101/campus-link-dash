import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

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
const mockAcceptOrder = vi.fn()
let mockOrders: unknown[] = []
vi.mock('@/hooks/useOrders', () => ({
  useOrders: () => ({
    orders: mockOrders,
    loading: false,
    error: null,
    fetchOrders: mockFetchOrders,
    acceptOrder: mockAcceptOrder,
    subscribeToOrders: mockSubscribeToOrders,
  }),
}))

const { default: Home } = await import('./Home')

const AUTH_USER = { user: { id: 'viewer-1', email: 'a@vitstudent.ac.in' }, profile: null }

const baseOrder = (overrides: Record<string, unknown> & { id: string }) => ({
  requester_id: 'requester-1',
  deliverer_id: null,
  restaurant_name: 'One Food World',
  items: ['2x Burger'],
  tip_amount: 30,
  delivery_location: { type: 'campus', label: 'TT Block' },
  status: 'pending',
  distance_km: null,
  distance_source: null,
  pickup_point_id: null,
  delivery_point_id: null,
  custom_delivery_lat: null,
  custom_delivery_lng: null,
  custom_delivery_note: null,
  created_at: '2026-08-26T12:00:00Z',
  requester_profile: null,
  deliverer_profile: null,
  ...overrides,
})

const renderPage = () => render(<MemoryRouter><Home /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ user: AUTH_USER, loading: false })
  mockOrders = []
})

describe('Home — 3B filters', () => {
  it('shows All / Quick errands / High reward filter chips, never the old Nearby/High tip labels', () => {
    mockOrders = [baseOrder({ id: 'a' })]
    renderPage()

    expect(screen.getByRole('button', { name: /All/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Quick errands/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /High reward/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Nearby/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /High tip/ })).not.toBeInTheDocument()
  })

  it('never implies the system knows the viewer physical location', () => {
    mockOrders = [baseOrder({ id: 'a', distance_km: 0.3, distance_source: 'routed' })]
    renderPage()

    expect(screen.queryByText(/near you/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/your location/i)).not.toBeInTheDocument()
  })

  it('Quick errands never contains an unresolved (no-distance) order', async () => {
    mockOrders = [
      baseOrder({ id: 'routed', tip_amount: 30, distance_km: 0.3, distance_source: 'routed' }),
      baseOrder({ id: 'legacy', tip_amount: 90, distance_km: null, distance_source: null }),
    ]
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Quick errands/ }))

    // The routed order's restaurant→location line appears; the legacy
    // order's ₹90 tip must not appear anywhere in this filtered view.
    expect(screen.queryByText('₹90')).not.toBeInTheDocument()
  })

  it('never describes a fallback distance as a walk', () => {
    mockOrders = [baseOrder({ id: 'a', tip_amount: 30, distance_km: 0.42, distance_source: 'fallback' })]
    renderPage()

    expect(screen.getByText(/distance estimate/)).toBeInTheDocument()
    expect(screen.queryByText(/min walk/)).not.toBeInTheDocument()
  })

  it('describes a routed distance as a walking estimate', () => {
    mockOrders = [baseOrder({ id: 'a', tip_amount: 30, distance_km: 1, distance_source: 'routed' })]
    renderPage()

    expect(screen.getByText(/min walk/)).toBeInTheDocument()
  })

  it('shows a legacy/unresolved order with no fabricated distance or reason', () => {
    mockOrders = [baseOrder({ id: 'a', tip_amount: 30, distance_km: null, distance_source: null })]
    renderPage()

    expect(screen.getByText(/distance unknown/)).toBeInTheDocument()
    expect(screen.queryByText(/quick errand nearby/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/good reward/i)).not.toBeInTheDocument()
  })

  it('shows an honest empty state for Quick errands rather than a decorative empty section', async () => {
    mockOrders = [baseOrder({ id: 'a', tip_amount: 30, distance_km: null, distance_source: null })]
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Quick errands/ }))

    expect(screen.getByText(/nothing on the board right now has a real distance/i)).toBeInTheDocument()
  })

  it('does not fetch or subscribe more than once per filter switch (no repeated network requests)', async () => {
    mockOrders = [baseOrder({ id: 'a' })]
    const user = userEvent.setup()
    renderPage()

    const callsBefore = mockFetchOrders.mock.calls.length
    await user.click(screen.getByRole('button', { name: /Quick errands/ }))
    await user.click(screen.getByRole('button', { name: /High reward/ }))
    await user.click(screen.getByRole('button', { name: /All/ }))

    expect(mockFetchOrders.mock.calls.length).toBe(callsBefore)
    expect(mockSubscribeToOrders).toHaveBeenCalledTimes(1)
  })
})
