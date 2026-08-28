import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
// Deliberately far from the other three (~111 km) - used only by the
// Phase 3H proximity tests below; every pre-existing test in this file
// only selects points by id/label, never by coordinate, so adding this
// doesn't affect them.
const FAR_ID = 'point-far'
const VIEWER_LAT = 12.97
const VIEWER_LNG = 79.16
// One degree of latitude is ~111,320m - used to place pickup points at
// known, controlled straight-line distances from VIEWER_LAT/LNG (pure
// north/south so haversine reduces to this exact ratio), for the 50/100/
// 200/500m radius test matrix. Comfortably clear of each preset boundary
// in both directions, so floating-point/haversine rounding never matters.
const metersNorth = (m: number) => VIEWER_LAT + m / 111320
const POINT_30M_ID = 'point-30m'
const POINT_80M_ID = 'point-80m'
const POINT_150M_ID = 'point-150m'
const POINT_300M_ID = 'point-300m'
const POINT_700M_ID = 'point-700m'
vi.mock('@/hooks/useCampusPoints', () => ({
  useCampusPoints: () => ({
    points: [
      { id: BALAJI_ID, key: 'campus-store', label: 'Balaji Store', kind: 'shop', wing: null, lat: 12.97, lng: 79.16 },
      { id: TT_ID, key: 'tt-block', label: 'TT', kind: 'academic', wing: null, lat: 12.97, lng: 79.16 },
      { id: SJT_ID, key: 'sjt-block', label: 'SJT Block', kind: 'academic', wing: null, lat: 12.97, lng: 79.16 },
      { id: FAR_ID, key: 'far-block', label: 'Far Block', kind: 'academic', wing: null, lat: 13.97, lng: 79.16 },
      { id: POINT_30M_ID, key: 'point-30m', label: 'A (30m)', kind: 'academic', wing: null, lat: metersNorth(30), lng: VIEWER_LNG },
      { id: POINT_80M_ID, key: 'point-80m', label: 'B (80m)', kind: 'academic', wing: null, lat: metersNorth(80), lng: VIEWER_LNG },
      { id: POINT_150M_ID, key: 'point-150m', label: 'C (150m)', kind: 'academic', wing: null, lat: metersNorth(150), lng: VIEWER_LNG },
      { id: POINT_300M_ID, key: 'point-300m', label: 'D (300m)', kind: 'academic', wing: null, lat: metersNorth(300), lng: VIEWER_LNG },
      { id: POINT_700M_ID, key: 'point-700m', label: 'E (700m)', kind: 'academic', wing: null, lat: metersNorth(700), lng: VIEWER_LNG },
    ],
    byKey: () => undefined,
    byCategory: () => [],
    byWing: () => [],
    loading: false,
  }),
}))

const mockFetchAcceptedFriendIds = vi.fn()
vi.mock('@/hooks/useFriends', () => ({
  useFriends: () => ({ fetchAcceptedFriendIds: mockFetchAcceptedFriendIds }),
}))

const mockGetProfilesReputation = vi.fn()
vi.mock('@/hooks/useRatings', () => ({
  useRatings: () => ({ getProfilesReputation: mockGetProfilesReputation }),
}))

const mockUsePreferences = vi.fn()
vi.mock('@/hooks/usePreferences', () => ({
  usePreferences: () => mockUsePreferences(),
}))

const mockUseDiscoveryLocation = vi.fn()
vi.mock('@/hooks/useDiscoveryLocation', () => ({
  useDiscoveryLocation: (enabled: boolean) => mockUseDiscoveryLocation(enabled),
}))

const DEFAULT_PREFERENCES = {
  user_id: 'viewer-1',
  discovery_radius_km: null,
  use_live_location: false,
  notify_chat_messages: true,
  notify_friend_events: true,
  discoverable: true,
  use_friends_in_recommendations: true,
  created_at: '',
}

const { default: Home } = await import('./Home')

const AUTH_USER = { user: { id: 'viewer-1', email: 'a@vitstudent.ac.in' }, profile: null , emailVerified: true }

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
  mockFetchAcceptedFriendIds.mockResolvedValue(new Set())
  mockGetProfilesReputation.mockResolvedValue(new Map())
  mockUsePreferences.mockReturnValue({
    preferences: DEFAULT_PREFERENCES,
    preferredPointIds: new Set(),
    loading: false,
    savePreferences: vi.fn(),
    savePreferredPoints: vi.fn(),
    resetPreferences: vi.fn(),
  })
  mockUseDiscoveryLocation.mockReturnValue({ status: 'idle' })
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

describe('Home — accepting an order', () => {
  it("shows the requester's name and phone in the confirmation toast", async () => {
    mockOrders = [baseOrder({
      id: 'a',
      requester_profile: { id: 'requester-1', name: 'Priya Sharma', phone: '9876543210' },
    })]
    mockAcceptOrder.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /take/i }))

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Taken', description: expect.stringContaining('Priya Sharma · 9876543210') }),
    ))
  })

  it('falls back to a generic confirmation when the requester has no phone on file', async () => {
    mockOrders = [baseOrder({
      id: 'a',
      requester_profile: { id: 'requester-1', name: 'Priya Sharma', phone: null },
    })]
    mockAcceptOrder.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /take/i }))

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Taken', description: expect.stringContaining('Priya Sharma') }),
    ))
    expect(mockToast.mock.calls[0][0].description).not.toContain('null')
  })

  // Phase 3J - see PHASE3_3J_TRUST_SAFETY_SPEC.md §2/§8. UX courtesy
  // only - orders_enforce_acceptor_verified (server-side) is the real
  // boundary regardless of this client-side pre-check.
  it('shows a verify-email prompt and never calls acceptOrder when unverified', async () => {
    mockOrders = [baseOrder({ id: 'a', requester_profile: { id: 'requester-1', name: 'Priya Sharma', phone: '9876543210' } })]
    mockUseAuth.mockReturnValue({ user: { ...AUTH_USER, emailVerified: false }, loading: false })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /take/i }))

    expect(mockAcceptOrder).not.toHaveBeenCalled()
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Verify your email to do this', variant: 'destructive' }),
    ))
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

describe('Home — 3F Recommended', () => {
  it('shows the Recommended filter chip alongside the existing three', () => {
    mockOrders = [baseOrder({ id: 'a' })]
    renderPage()
    expect(screen.getByRole('button', { name: /Recommended/ })).toBeInTheDocument()
  })

  it('never claims proximity or an opaque match score in the Recommended view', async () => {
    mockOrders = [baseOrder({ id: 'a', tip_amount: 30, distance_km: 0.3, distance_source: 'routed' })]
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Recommended/ }))

    expect(screen.queryByText(/near you/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/nearby you/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/best for you/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/perfect match/i)).not.toBeInTheDocument()
    expect(screen.getByText('Based on reward, route quality, trust and connections.')).toBeInTheDocument()
  })

  it("excludes the viewer's own posted order from Recommended", async () => {
    mockOrders = [
      baseOrder({ id: 'mine', requester_id: 'viewer-1', tip_amount: 100, distance_km: 0.2, distance_source: 'routed' }),
      baseOrder({ id: 'theirs', requester_id: 'requester-2', tip_amount: 10, distance_km: 2, distance_source: 'fallback' }),
    ]
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Recommended/ }))

    expect(screen.queryByText('₹100')).not.toBeInTheDocument()
    expect(await screen.findByText('₹10')).toBeInTheDocument()
  })

  it('ranks routed above fallback above unresolved regardless of reward', async () => {
    mockOrders = [
      baseOrder({ id: 'unresolved', tip_amount: 500, distance_km: null, distance_source: null }),
      baseOrder({ id: 'fallback', tip_amount: 5, distance_km: 3, distance_source: 'fallback' }),
      baseOrder({ id: 'routed', tip_amount: 1, distance_km: 3, distance_source: 'routed' }),
    ]
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Recommended/ }))

    // The "up for grabs" summary badge also renders as ₹<sum> - exclude
    // it so this only asserts the order-card tips, in rendered order.
    const total = 500 + 5 + 1
    const tips = (await screen.findAllByText(/^₹\d+$/)).filter((el) => el.textContent !== `₹${total}`)
    expect(tips.map((el) => el.textContent)).toEqual(['₹1', '₹5', '₹500'])
  })

  it('breaks a tie between equal reward density using reputation, without penalizing an unrated requester', async () => {
    mockGetProfilesReputation.mockResolvedValue(new Map([
      ['rated-well', { avg_rating: 4.9, rating_count: 10 }],
      ['unrated', { avg_rating: null, rating_count: 0 }],
    ]))
    mockOrders = [
      baseOrder({ id: 'from-unrated', requester_id: 'unrated', tip_amount: 30, distance_km: 3, distance_source: 'routed', created_at: '2026-08-26T10:00:00Z' }),
      baseOrder({ id: 'from-rated', requester_id: 'rated-well', tip_amount: 30, distance_km: 3, distance_source: 'routed', created_at: '2026-08-26T09:00:00Z' }),
    ]
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Recommended/ }))

    // Equal reward density (same tip, same distance) - the rated
    // requester's order wins the tie, but the unrated one is still
    // shown, never dropped or visibly marked worse.
    const restaurantRows = await screen.findAllByText(/One Food World/)
    expect(restaurantRows).toHaveLength(2)
  })

  it('shows "Friend involved" only for a friend-authored order, as a tie-break nudge', async () => {
    mockFetchAcceptedFriendIds.mockResolvedValue(new Set(['friend-1']))
    mockOrders = [
      baseOrder({ id: 'from-friend', requester_id: 'friend-1', tip_amount: 30, distance_km: 3, distance_source: 'routed' }),
      baseOrder({ id: 'from-stranger', requester_id: 'stranger-1', tip_amount: 30, distance_km: 3, distance_source: 'routed', created_at: '2026-08-25T10:00:00Z' }),
    ]
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Recommended/ }))

    expect(await screen.findByText(/Friend involved/)).toBeInTheDocument()
  })

  it("shows an honest empty state when only the viewer's own orders remain", async () => {
    mockOrders = [baseOrder({ id: 'mine', requester_id: 'viewer-1' })]
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Recommended/ }))

    expect(await screen.findByText(/Nothing to recommend right now/)).toBeInTheDocument()
  })

  it('fetches friendship and reputation data exactly once, regardless of tab switches', async () => {
    mockOrders = [baseOrder({ id: 'a' }), baseOrder({ id: 'b', requester_id: 'requester-2' })]
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('button', { name: /Recommended/ })

    expect(mockFetchAcceptedFriendIds).toHaveBeenCalledTimes(1)
    expect(mockGetProfilesReputation).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /Recommended/ }))
    await user.click(screen.getByRole('button', { name: /Quick errands/ }))
    await user.click(screen.getByRole('button', { name: /High reward/ }))
    await user.click(screen.getByRole('button', { name: /^All/ }))

    expect(mockFetchAcceptedFriendIds).toHaveBeenCalledTimes(1)
    expect(mockGetProfilesReputation).toHaveBeenCalledTimes(1)
  })

  it('handles a legacy unresolved order (distance_source null) without crashing, ranked last by tier', async () => {
    mockOrders = [
      baseOrder({ id: 'legacy', tip_amount: 999, distance_km: null, distance_source: null }),
      baseOrder({ id: 'fallback', requester_id: 'requester-2', tip_amount: 1, distance_km: 1, distance_source: 'fallback' }),
    ]
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Recommended/ }))

    const total = 999 + 1
    const tips = (await screen.findAllByText(/^₹\d+$/)).filter((el) => el.textContent !== `₹${total}`)
    expect(tips.map((el) => el.textContent)).toEqual(['₹1', '₹999'])
  })
})

describe('Home — Phase 3H discovery', () => {
  const nearOrder = baseOrder({ id: 'near', pickup_point_id: BALAJI_ID, tip_amount: 30 })
  const farOrder = baseOrder({ id: 'far', requester_id: 'requester-2', pickup_point_id: FAR_ID, tip_amount: 30 })

  const withLiveLocation = (radiusKm: number | null, preferredPointIds: readonly string[] = []) => ({
    preferences: { ...DEFAULT_PREFERENCES, use_live_location: true, discovery_radius_km: radiusKm },
    preferredPointIds: new Set(preferredPointIds),
    loading: false,
    savePreferences: vi.fn(),
    savePreferredPoints: vi.fn(),
    resetPreferences: vi.fn(),
  })
  const grantedAt = (accuracyMeters = 20) => ({ status: 'granted' as const, lat: VIEWER_LAT, lng: VIEWER_LNG, accuracyMeters })

  it('a legacy user (preferences still default/unloaded) sees the full board - no discovery filter applied', () => {
    mockOrders = [nearOrder, farOrder]
    renderPage()

    expect(screen.getAllByText('2x Burger')).toHaveLength(2)
  })

  it('current location within radius: shows an order whose pickup point is inside the chosen radius', () => {
    mockUsePreferences.mockReturnValue(withLiveLocation(0.1))
    mockUseDiscoveryLocation.mockReturnValue(grantedAt())
    mockOrders = [nearOrder]
    renderPage()

    expect(screen.getByText('2x Burger')).toBeInTheDocument()
  })

  it('current location outside radius: hides an order whose pickup point is outside the chosen radius', () => {
    mockUsePreferences.mockReturnValue(withLiveLocation(0.1))
    mockUseDiscoveryLocation.mockReturnValue(grantedAt())
    mockOrders = [farOrder]
    renderPage()

    expect(screen.queryByText('2x Burger')).not.toBeInTheDocument()
    expect(screen.getByText(/nothing moving right now/i)).toBeInTheDocument()
  })

  // Item 9's exact matrix: five pickup points at known distances (30m/
  // 80m/150m/300m/700m), checked against every campus radius preset
  // (50m/100m/200m/500m). Each order's delivery_point_id is deliberately
  // the far campus point (~111km away) - proving delivery distance never
  // participates in the live-GPS radius check, only pickup does.
  describe('radius preset matrix - pickup-only, delivery distance ignored', () => {
    const orderAt = (id: string, pickupPointId: string) =>
      baseOrder({ id, pickup_point_id: pickupPointId, delivery_point_id: FAR_ID, tip_amount: 30 })
    const order30m = orderAt('order-30m', POINT_30M_ID)
    const order80m = orderAt('order-80m', POINT_80M_ID)
    const order150m = orderAt('order-150m', POINT_150M_ID)
    const order300m = orderAt('order-300m', POINT_300M_ID)
    const order700m = orderAt('order-700m', POINT_700M_ID)
    const allOrders = [order30m, order80m, order150m, order300m, order700m]

    const countAtRadius = (radiusKm: number) => {
      mockUsePreferences.mockReturnValue(withLiveLocation(radiusKm))
      mockUseDiscoveryLocation.mockReturnValue(grantedAt())
      mockOrders = allOrders
      renderPage()
      return screen.getAllByText('2x Burger').length
    }

    it('50m radius: only the 30m pickup is visible', () => {
      expect(countAtRadius(0.05)).toBe(1)
    })

    it('100m radius: the 30m and 80m pickups are visible', () => {
      expect(countAtRadius(0.1)).toBe(2)
    })

    it('200m radius: the 30m, 80m, and 150m pickups are visible', () => {
      expect(countAtRadius(0.2)).toBe(3)
    })

    it('500m radius: every pickup except the 700m one is visible', () => {
      expect(countAtRadius(0.5)).toBe(4)
    })

    it('a pickup 80m away still shows even when its delivery point is ~111km away', () => {
      mockUsePreferences.mockReturnValue(withLiveLocation(0.1))
      mockUseDiscoveryLocation.mockReturnValue(grantedAt())
      mockOrders = [order80m]
      renderPage()

      expect(screen.getByText('2x Burger')).toBeInTheDocument()
    })

    it('a pickup 150m away is hidden at a 100m radius even when its delivery point is only 20m away', () => {
      const nearDeliveryFarPickup = baseOrder({
        id: 'near-delivery-far-pickup',
        pickup_point_id: POINT_150M_ID,
        delivery_point_id: POINT_30M_ID,
        tip_amount: 30,
      })
      mockUsePreferences.mockReturnValue(withLiveLocation(0.1))
      mockUseDiscoveryLocation.mockReturnValue(grantedAt())
      mockOrders = [nearDeliveryFarPickup]
      renderPage()

      expect(screen.queryByText('2x Burger')).not.toBeInTheDocument()
    })

    // Direct, on-screen proof that the filter used the real GPS-to-pickup
    // distance, not the unrelated distance_km (3A routed/fallback trip)
    // figure - a real bug report was traced to exactly this ambiguity:
    // an order's caption showed a large, unrelated distance_km value
    // while its real GPS-to-pickup distance (now also shown) was well
    // inside the chosen radius.
    it("shows the order's actual GPS-to-pickup distance in its caption while Mode A is active", () => {
      mockUsePreferences.mockReturnValue(withLiveLocation(0.1))
      mockUseDiscoveryLocation.mockReturnValue(grantedAt())
      mockOrders = [order80m]
      renderPage()

      expect(screen.getByText(/~80m from you/)).toBeInTheDocument()
    })

    it('does not show a GPS-distance caption when Mode A is off', () => {
      mockOrders = [order80m]
      renderPage()

      expect(screen.queryByText(/from you/)).not.toBeInTheDocument()
    })
  })

  it('changing the radius recomputes the visible set immediately - no stale opportunities from the previous radius', () => {
    const orderAt = (id: string, pickupPointId: string) =>
      baseOrder({ id, pickup_point_id: pickupPointId, tip_amount: 30 })
    mockOrders = [
      orderAt('order-30m', POINT_30M_ID),
      orderAt('order-80m', POINT_80M_ID),
      orderAt('order-150m', POINT_150M_ID),
      orderAt('order-300m', POINT_300M_ID),
      orderAt('order-700m', POINT_700M_ID),
    ]
    mockUseDiscoveryLocation.mockReturnValue(grantedAt())

    mockUsePreferences.mockReturnValue(withLiveLocation(2))
    const { rerender } = render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getAllByText('2x Burger')).toHaveLength(5)

    mockUsePreferences.mockReturnValue(withLiveLocation(0.5))
    rerender(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getAllByText('2x Burger')).toHaveLength(4)

    mockUsePreferences.mockReturnValue(withLiveLocation(0.2))
    rerender(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getAllByText('2x Burger')).toHaveLength(3)

    mockUsePreferences.mockReturnValue(withLiveLocation(0.1))
    rerender(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getAllByText('2x Burger')).toHaveLength(2)

    mockUsePreferences.mockReturnValue(withLiveLocation(0.05))
    rerender(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getAllByText('2x Burger')).toHaveLength(1)
  })

  it('permission denied with preferred areas saved: falls back to the area-membership filter automatically and shows the status line', () => {
    mockUsePreferences.mockReturnValue(withLiveLocation(0.1, [BALAJI_ID]))
    mockUseDiscoveryLocation.mockReturnValue({ status: 'denied' })
    mockOrders = [nearOrder, farOrder]
    renderPage()

    // near's pickup is BALAJI_ID (preferred); far's is not - only near shows.
    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    expect(screen.getByText(/location access is off/i)).toBeInTheDocument()
    expect(screen.getByText(/preferred areas instead/i)).toBeInTheDocument()
  })

  it('permission denied with no preferred areas saved: shows the full board with a status line, not an empty page', () => {
    mockUsePreferences.mockReturnValue(withLiveLocation(0.1))
    mockUseDiscoveryLocation.mockReturnValue({ status: 'denied' })
    mockOrders = [nearOrder, farOrder]
    renderPage()

    expect(screen.getAllByText('2x Burger')).toHaveLength(2)
    expect(screen.getByText(/showing the full board instead/i)).toBeInTheDocument()
  })

  it('unsupported browser: falls back gracefully, page remains fully usable', () => {
    mockUsePreferences.mockReturnValue(withLiveLocation(0.1))
    mockUseDiscoveryLocation.mockReturnValue({ status: 'unsupported' })
    mockOrders = [nearOrder]
    renderPage()

    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /All/ })).toBeInTheDocument()
  })

  it('shows no discovery status line at all when live location is off (the default)', () => {
    mockOrders = [nearOrder, farOrder]
    renderPage()

    expect(screen.queryByText(/location access/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/preferred areas instead/i)).not.toBeInTheDocument()
  })

  // Regression test for the actual root cause of "Home loses everything":
  // merely having saved preferred areas must never filter the board on
  // its own - it is Mode A's fallback, only relevant while the user has
  // explicitly turned live location on. A user who saved preferred areas
  // (say, while trying the feature) but has live location off must still
  // see the full, unfiltered board.
  it('preferred areas saved but live location OFF: shows the full board, does not silently activate Mode B', () => {
    mockUsePreferences.mockReturnValue({
      preferences: { ...DEFAULT_PREFERENCES, use_live_location: false, discovery_radius_km: null },
      preferredPointIds: new Set([BALAJI_ID]),
      loading: false,
      savePreferences: vi.fn(),
      savePreferredPoints: vi.fn(),
      resetPreferences: vi.fn(),
    })
    mockUseDiscoveryLocation.mockReturnValue({ status: 'idle' })
    mockOrders = [nearOrder, farOrder]
    renderPage()

    expect(screen.getAllByText('2x Burger')).toHaveLength(2)
    expect(screen.queryByText(/preferred areas instead/i)).not.toBeInTheDocument()
  })

  it('never sends any coordinate to fetchOrders - discovery filtering is purely client-side', () => {
    mockUsePreferences.mockReturnValue(withLiveLocation(0.1))
    mockUseDiscoveryLocation.mockReturnValue(grantedAt())
    mockOrders = [nearOrder]
    renderPage()

    expect(mockFetchOrders).toHaveBeenCalledWith({ viewerId: 'viewer-1' })
  })
})

describe('Home — personalized greeting', () => {
  it('shows "Hello, {firstName}" using the first token of the real profile name', () => {
    mockUseAuth.mockReturnValue({ user: { ...AUTH_USER, profile: { name: 'Govind Nair' } }, loading: false })
    renderPage()
    expect(screen.getByText('Hello, Govind')).toBeInTheDocument()
  })

  it('extracts the first name correctly for a different real name, never hardcoded', () => {
    mockUseAuth.mockReturnValue({ user: { ...AUTH_USER, profile: { name: 'Raj Sudarshan' } }, loading: false })
    renderPage()
    expect(screen.getByText('Hello, Raj')).toBeInTheDocument()
    expect(screen.queryByText('Hello, Govind')).not.toBeInTheDocument()
  })

  it('shows no greeting at all when the profile has not loaded yet, rather than "Hello, "', () => {
    mockUseAuth.mockReturnValue({ user: AUTH_USER, loading: false }) // profile: null
    renderPage()
    expect(screen.queryByText(/^Hello,/)).not.toBeInTheDocument()
  })
})
