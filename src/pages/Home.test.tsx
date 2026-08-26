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

// Real campus_points IDs the Where filter's tests select by label - kept
// tiny and fixed rather than fetched, same mocking pattern PostRequest's
// own tests already use for this hook.
const BALAJI_ID = 'point-balaji'
const TT_ID = 'point-tt'
const SJT_ID = 'point-sjt'
vi.mock('@/hooks/useCampusPoints', () => ({
  useCampusPoints: () => ({
    points: [
      { id: BALAJI_ID, key: 'campus-store', label: 'Balaji Store', kind: 'shop', wing: null, lat: 12.97, lng: 79.16 },
      { id: TT_ID, key: 'tt-block', label: 'TT', kind: 'academic', wing: null, lat: 12.97, lng: 79.16 },
      { id: SJT_ID, key: 'sjt-block', label: 'SJT Block', kind: 'academic', wing: null, lat: 12.97, lng: 79.16 },
    ],
    byKey: () => undefined,
    byCategory: () => [],
    byWing: () => [],
    loading: false,
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

describe('Home — Where (From/To location filter)', () => {
  const balajiToTT = baseOrder({
    id: 'balaji-tt', tip_amount: 30, distance_km: 0.1, distance_source: 'routed',
    pickup_point_id: BALAJI_ID, delivery_point_id: TT_ID,
  })
  const balajiToSjt = baseOrder({
    id: 'balaji-sjt', tip_amount: 20, distance_km: 0.6, distance_source: 'fallback',
    pickup_point_id: BALAJI_ID, delivery_point_id: SJT_ID,
  })
  const sjtToTT = baseOrder({
    id: 'sjt-tt', tip_amount: 40, distance_km: 1.5, distance_source: 'fallback',
    pickup_point_id: SJT_ID, delivery_point_id: TT_ID,
  })
  const legacy = baseOrder({ id: 'legacy', tip_amount: 90 }) // no pickup/delivery point at all

  const openWhere = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /^Where$/ }))
  }

  const pickInField = async (user: ReturnType<typeof userEvent.setup>, fieldLabel: string, optionLabel: string) => {
    const combobox = screen.getByRole('combobox', { name: new RegExp(`^${fieldLabel}$`) })
    await user.click(combobox)
    const option = await screen.findByText(optionLabel)
    await user.click(option)
  }

  it('From only: shows every order picked up at that point', async () => {
    mockOrders = [balajiToTT, balajiToSjt, sjtToTT, legacy]
    const user = userEvent.setup()
    renderPage()

    await openWhere(user)
    await pickInField(user, 'From', 'Balaji Store')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(screen.getByText(/From: Balaji Store/)).toBeInTheDocument()
    expect(screen.queryByText('₹40')).not.toBeInTheDocument() // sjt-tt, not from Balaji
    expect(screen.queryByText('₹90')).not.toBeInTheDocument() // legacy, no pickup point
  })

  it('To only: shows every order going to that point', async () => {
    mockOrders = [balajiToTT, balajiToSjt, sjtToTT, legacy]
    const user = userEvent.setup()
    renderPage()

    await openWhere(user)
    await pickInField(user, 'To', 'TT')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(screen.getByText(/To: TT/)).toBeInTheDocument()
    expect(screen.queryByText('₹20')).not.toBeInTheDocument() // balaji-sjt, not going to TT
    expect(screen.queryByText('₹90')).not.toBeInTheDocument() // legacy, no delivery point
  })

  it('From + To: shows only the exact pickup-to-delivery pair', async () => {
    mockOrders = [balajiToTT, balajiToSjt, sjtToTT, legacy]
    const user = userEvent.setup()
    renderPage()

    await openWhere(user)
    await pickInField(user, 'From', 'Balaji Store')
    await pickInField(user, 'To', 'TT')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(screen.getByText(/From: Balaji Store · To: TT/)).toBeInTheDocument()
    // The hero's total-tip figure can coincidentally match the one
    // remaining order's own tip (both ₹30 here) - assert presence via
    // getAllByText rather than assuming a single match.
    expect(screen.getAllByText('₹30').length).toBeGreaterThan(0)
    expect(screen.queryByText('₹20')).not.toBeInTheDocument()
    expect(screen.queryByText('₹40')).not.toBeInTheDocument()
    expect(screen.queryByText('₹90')).not.toBeInTheDocument()
  })

  it('clearing the filter restores every order, including legacy/unresolved ones, under All', async () => {
    mockOrders = [balajiToTT, legacy]
    const user = userEvent.setup()
    renderPage()

    await openWhere(user)
    await pickInField(user, 'From', 'Balaji Store')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.queryByText('₹90')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /From: Balaji Store/ }))
    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(screen.queryByText(/From:/)).not.toBeInTheDocument()
    expect(screen.getByText('₹90')).toBeInTheDocument()
  })

  it('legacy/unresolved orders remain visible under All with no location filter applied', () => {
    mockOrders = [legacy]
    renderPage()

    // A single order means the hero's total-tip figure can coincidentally
    // match this order's own tip - assert presence, not uniqueness.
    expect(screen.getAllByText('₹90').length).toBeGreaterThan(0)
  })

  it('an unresolved order never matches a specific From or To filter', async () => {
    mockOrders = [legacy]
    const user = userEvent.setup()
    renderPage()

    await openWhere(user)
    await pickInField(user, 'From', 'Balaji Store')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(screen.queryByText('₹90')).not.toBeInTheDocument()
    expect(screen.getByText(/nothing matches/i)).toBeInTheDocument()
  })

  it('composes with Quick errands: only routed/fallback orders matching the location filter appear', async () => {
    mockOrders = [balajiToTT, balajiToSjt, sjtToTT, legacy]
    const user = userEvent.setup()
    renderPage()

    await openWhere(user)
    await pickInField(user, 'From', 'Balaji Store')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /Quick errands/ }))

    // Quick errands count should be exactly the 2 Balaji-Store-origin orders.
    expect(screen.getByRole('button', { name: /Quick errands\s*2/ })).toBeInTheDocument()
    expect(screen.queryByText('₹40')).not.toBeInTheDocument()
  })

  it('composes with High reward: ranking still applies within the location-filtered set', async () => {
    mockOrders = [balajiToTT, balajiToSjt, sjtToTT, legacy]
    const user = userEvent.setup()
    renderPage()

    await openWhere(user)
    await pickInField(user, 'From', 'Balaji Store')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /High reward/ }))

    // High reward under From=Balaji still excludes sjt-tt entirely.
    expect(screen.queryByText('₹40')).not.toBeInTheDocument()
    expect(screen.getByText('₹30')).toBeInTheDocument()
    expect(screen.getByText('₹20')).toBeInTheDocument()
  })

  it('creates zero additional network requests when opening Where, selecting, applying, or clearing', async () => {
    mockOrders = [balajiToTT, legacy]
    const user = userEvent.setup()
    renderPage()

    const callsBefore = mockFetchOrders.mock.calls.length
    await openWhere(user)
    await pickInField(user, 'From', 'Balaji Store')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /From: Balaji Store/ }))
    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(mockFetchOrders.mock.calls.length).toBe(callsBefore)
    expect(mockSubscribeToOrders).toHaveBeenCalledTimes(1)
  })
})
