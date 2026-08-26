import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockCreateOrder = vi.fn()
const mockComputeWalkingRoute = vi.fn()
const mockComputeWalkingRouteCustom = vi.fn()
vi.mock('@/hooks/useOrders', () => ({
  useOrders: () => ({
    createOrder: mockCreateOrder,
    computeWalkingRoute: mockComputeWalkingRoute,
    computeWalkingRouteCustom: mockComputeWalkingRouteCustom,
  }),
}))

// Real staging has 59 active campus_points across 7 categories - these are
// enough to drive the picker end-to-end without asserting on the full
// catalog. All are seeded (real coordinates), matching what the picker can
// ever offer - an unseeded point never reaches byCategory()/byKey() in the
// real hook, since RLS only returns active rows.
//
// BLOCK_K stands in for a "confirmed Men's Hostel block" for the generic
// flow tests. MENS_A/LADIES_A are two REAL, physically distinct locations
// per PHASE3_3A_LOCATION_SPEC.md's Accommodation correction - never the
// same campus_points row, never sharing a coordinate, even though they
// share the letter "A".
const ONE_FOOD = { id: 'point-one-food', key: 'one-food', label: 'One Food World', kind: 'food', wing: null, lat: 12.9762, lng: 79.1617 }
const BLOCK_K = { id: 'point-block-k', key: 'hostel-block-k', label: 'Block K', kind: 'accommodation', wing: 'mens', lat: 12.971, lng: 79.161 }
const MENS_A = { id: 'point-mens-a', key: 'hostel-mens-a', label: "Men's Hostel A", kind: 'accommodation', wing: 'mens', lat: 12.9700, lng: 79.1500 }
const LADIES_A = { id: 'point-ladies-a', key: 'hostel-ladies-a', label: 'Ladies Hostel A', kind: 'accommodation', wing: 'ladies', lat: 12.9800, lng: 79.1600 }
const MGB = { id: 'point-mgb', key: 'mgb', label: 'Mahatma Gandhi Block (MGB)', kind: 'accommodation', wing: null, lat: 12.9720, lng: 79.1679 }

const ALL_MOCK_POINTS = [ONE_FOOD, BLOCK_K, MENS_A, LADIES_A, MGB]
const byKeyImpl = (key: string) => ALL_MOCK_POINTS.find((p) => p.key === key)
const byCategoryImpl = (kind: string) => ALL_MOCK_POINTS.filter((p) => p.kind === kind)
const byWingImpl = (wing: 'mens' | 'ladies' | null) => ALL_MOCK_POINTS.filter((p) => p.kind === 'accommodation' && p.wing === wing)

const mockCampusPoints = vi.fn(() => ({
  points: ALL_MOCK_POINTS,
  byKey: byKeyImpl,
  byCategory: byCategoryImpl,
  byWing: byWingImpl,
  loading: false,
}))
vi.mock('@/hooks/useCampusPoints', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useCampusPoints')>('@/hooks/useCampusPoints')
  return { ...actual, useCampusPoints: () => mockCampusPoints() }
})

// MapLibre needs a real WebGL context jsdom doesn't provide - stand in
// with a button that simulates a map tap, so the custom-pin flow is still
// exercised without touching real map internals.
vi.mock('@/components/map/CampusMap', () => ({
  default: ({ onSelectLocation }: { onSelectLocation?: (lat: number, lng: number) => void }) => (
    <button type="button" onClick={() => onSelectLocation?.(12.9705, 79.1601)}>
      Simulate map tap
    </button>
  ),
}))

const { default: PostRequest } = await import('./PostRequest')

const AUTH_USER = { user: { id: 'requester-1', email: 'a@vitstudent.ac.in' }, profile: null }

const renderPage = () => render(<MemoryRouter><PostRequest /></MemoryRouter>)

/** Drives the flow from step 1 through to the Review step with valid data. */
const fillThroughToReview = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'One Food World' }))
  await user.type(screen.getByLabelText('Items'), '2x Chicken Burger\n1x Coke')
  await user.click(screen.getByRole('button', { name: 'Continue' }))

  await user.click(screen.getByRole('button', { name: 'Accommodation' }))
  await user.click(screen.getByRole('button', { name: "Men's Hostel" }))
  await user.click(screen.getByRole('button', { name: 'Block K' }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))

  await user.click(screen.getByRole('button', { name: '₹50' }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ user: AUTH_USER })
  mockCampusPoints.mockReturnValue({
    points: ALL_MOCK_POINTS,
    byKey: byKeyImpl,
    byCategory: byCategoryImpl,
    byWing: byWingImpl,
    loading: false,
  })
  mockComputeWalkingRoute.mockResolvedValue({ distanceKm: 0.42, geometry: null, etaMinutes: 5 })
  mockComputeWalkingRouteCustom.mockResolvedValue({ distanceKm: 0.3, geometry: null, etaMinutes: 4 })
})

describe('PostRequest', () => {
  it('starts on step 1 (What) with restaurants and an items field', () => {
    renderPage()
    expect(screen.getByText('1 / 4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'What' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'One Food World' })).toBeInTheDocument()
    expect(screen.getByLabelText('Items')).toBeInTheDocument()
  })

  it('blocks advancing from step 1 without a restaurant or items, with a specific message', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByText('1 / 4')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/select where you.re ordering from/i)

    await user.click(screen.getByRole('button', { name: 'One Food World' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/add at least one item/i)
  })

  it('advances to step 2 (Where) once restaurant and items are provided', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'One Food World' }))
    await user.type(screen.getByLabelText('Items'), '2x Chicken Burger')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByText('2 / 4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Where' })).toBeInTheDocument()
  })

  it('shows the 7 catalog categories plus Drop a pin, and blocks advancing until a location is picked', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'One Food World' }))
    await user.type(screen.getByLabelText('Items'), '2x Chicken Burger')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    for (const label of ['Food', 'Shops', 'Accommodation', 'Academic', 'Sports & Recreation', 'Medical & Health', 'Landmarks']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: /drop a pin/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/pick a delivery location/i)

    await user.click(screen.getByRole('button', { name: 'Accommodation' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/pick men.s, ladies, or annex/i)

    await user.click(screen.getByRole('button', { name: "Men's Hostel" }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/pick a location from the list/i)
  })

  it('treats Men’s Hostel A and Ladies Hostel A as distinct campus points with different coordinates, never sharing a list', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'One Food World' }))
    await user.type(screen.getByLabelText('Items'), '2x Chicken Burger')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Accommodation' }))

    await user.click(screen.getByRole('button', { name: "Men's Hostel" }))
    expect(screen.getByRole('button', { name: "Men's Hostel A" })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ladies Hostel A' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ladies Hostel' }))
    expect(screen.getByRole('button', { name: 'Ladies Hostel A' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "Men's Hostel A" })).not.toBeInTheDocument()

    // Annex / Other covers genuinely wingless points (MGB) and any
    // not-yet-wing-confirmed block - never the real Men's/Ladies A points
    // (Block K is wing:'mens' in this mock, so it belongs under Men's -
    // not asserted here, covered by the generic flow tests instead).
    await user.click(screen.getByRole('button', { name: 'Annex / Other' }))
    expect(screen.getByRole('button', { name: 'Mahatma Gandhi Block (MGB)' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "Men's Hostel A" })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ladies Hostel A' })).not.toBeInTheDocument()
  })

  it('selecting Men’s Hostel A stores that point\'s id and coordinates; selecting Ladies Hostel A stores the other, distinct point', async () => {
    mockCreateOrder.mockResolvedValue({ id: 'order-1' })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'One Food World' }))
    await user.type(screen.getByLabelText('Items'), '2x Chicken Burger')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Accommodation' }))
    await user.click(screen.getByRole('button', { name: "Men's Hostel" }))
    await user.click(screen.getByRole('button', { name: "Men's Hostel A" }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: '₹50' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(mockComputeWalkingRoute).toHaveBeenCalledWith('point-one-food', 'point-mens-a'))

    await user.click(screen.getByRole('button', { name: 'Post this request' }))

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery_point_id: 'point-mens-a',
        delivery_location: { type: 'campus', label: "Men's Hostel A" },
      })
    ))
  })

  it('routes Ladies Hostel A to its own distinct point, never the Men’s Hostel A coordinate', async () => {
    mockCreateOrder.mockResolvedValue({ id: 'order-1' })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'One Food World' }))
    await user.type(screen.getByLabelText('Items'), '2x Chicken Burger')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Accommodation' }))
    await user.click(screen.getByRole('button', { name: 'Ladies Hostel' }))
    await user.click(screen.getByRole('button', { name: 'Ladies Hostel A' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: '₹50' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(mockComputeWalkingRoute).toHaveBeenCalledWith('point-one-food', 'point-ladies-a'))
    expect(mockComputeWalkingRoute).not.toHaveBeenCalledWith('point-one-food', 'point-mens-a')

    await user.click(screen.getByRole('button', { name: 'Post this request' }))

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery_point_id: 'point-ladies-a',
        delivery_location: { type: 'campus', label: 'Ladies Hostel A' },
      })
    ))
  })

  it('lets the user drop a custom pin with a note instead of picking a catalog point', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'One Food World' }))
    await user.type(screen.getByLabelText('Items'), '2x Chicken Burger')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await user.click(screen.getByRole('button', { name: /drop a pin/i }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/drop a pin on the map/i)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Simulate map tap' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Simulate map tap' }))
    await user.type(screen.getByLabelText(/note for the deliverer/i), 'Outside TT Tower, near the north entrance')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByText('3 / 4')).toBeInTheDocument()
  })

  it('preserves entered data when navigating back', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'One Food World' }))
    await user.type(screen.getByLabelText('Items'), '2x Chicken Burger')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByText('1 / 4')).toBeInTheDocument()
    expect(screen.getByLabelText('Items')).toHaveValue('2x Chicken Burger')
    expect(screen.getByRole('button', { name: 'One Food World' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('lets a preset set the tip, reflected in the live preview', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'One Food World' }))
    await user.type(screen.getByLabelText('Items'), '2x Chicken Burger')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Accommodation' }))
    await user.click(screen.getByRole('button', { name: "Men's Hostel" }))
    await user.click(screen.getByRole('button', { name: 'Block K' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await user.click(screen.getByRole('button', { name: '₹75' }))
    expect(screen.getAllByText('₹75').length).toBeGreaterThan(0)
  })

  it('shows a full summary on the Review step', async () => {
    const user = userEvent.setup()
    renderPage()
    await fillThroughToReview(user)

    // The desktop preview panel renders alongside step 4's own content
    // regardless of viewport in jsdom, so both may match - that's expected.
    expect(screen.getByText('4 / 4')).toBeInTheDocument()
    expect(screen.getAllByText('2x Chicken Burger, 1x Coke').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/One Food World.*Block K/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Post this request' })).toBeInTheDocument()
  })

  it('never shows a suggested-reward figure - only real distance and ETA', async () => {
    const user = userEvent.setup()
    renderPage()
    await fillThroughToReview(user)

    // geometry: null here (see the default mock above) - a fallback
    // straight-line estimate, never labeled as a walked route.
    await waitFor(() => expect(screen.getAllByText(/~0\.4 km · distance estimate/).length).toBeGreaterThan(0))
    expect(screen.queryByText(/similar runs/i)).not.toBeInTheDocument()
  })

  it('labels a real routed geometry as a walking estimate, never as a plain distance estimate', async () => {
    mockComputeWalkingRoute.mockResolvedValue({
      distanceKm: 0.42,
      geometry: { type: 'LineString', coordinates: [[79.1617, 12.9762], [79.161, 12.971]] },
      etaMinutes: 5,
    })
    const user = userEvent.setup()
    renderPage()
    await fillThroughToReview(user)

    await waitFor(() => expect(screen.getAllByText(/0\.4 km · ~5 min walk/).length).toBeGreaterThan(0))
    expect(screen.queryByText(/distance estimate/)).not.toBeInTheDocument()
  })

  it('labels a no-path fallback as a distance estimate, never as a walking route', async () => {
    mockComputeWalkingRoute.mockResolvedValue({ distanceKm: 0.42, geometry: null, etaMinutes: 5 })
    const user = userEvent.setup()
    renderPage()
    await fillThroughToReview(user)

    await waitFor(() => expect(screen.getAllByText(/~0\.4 km · distance estimate/).length).toBeGreaterThan(0))
    expect(screen.queryByText(/min walk/)).not.toBeInTheDocument()
  })

  it('posts the request with the exact real fields, and shows a completion state', async () => {
    mockCreateOrder.mockResolvedValue({ id: 'order-1' })
    const user = userEvent.setup()
    renderPage()
    await fillThroughToReview(user)

    await user.click(screen.getByRole('button', { name: 'Post this request' }))

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledTimes(1))
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        requester_id: 'requester-1',
        deliverer_id: null,
        restaurant_name: 'One Food World',
        items: ['2x Chicken Burger', '1x Coke'],
        tip_amount: 50,
        delivery_location: { type: 'campus', label: 'Block K' },
        status: 'pending',
        distance_km: 0.42,
        pickup_point_id: 'point-one-food',
        delivery_point_id: 'point-block-k',
        custom_delivery_lat: null,
        custom_delivery_lng: null,
        custom_delivery_note: null,
      })
    )

    await waitFor(() => expect(screen.getByText(/it.s on the board/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'View on Activity' })).toBeInTheDocument()
  })

  it('shows no distance line when the pickup point has no real coordinate yet', async () => {
    mockCampusPoints.mockReturnValue({
      points: [BLOCK_K],
      byKey: () => undefined, // 'one-food' unresolved - not currently seeded
      byCategory: (kind: string) => [BLOCK_K].filter((p) => p.kind === kind),
      byWing: (wing: 'mens' | 'ladies' | null) => [BLOCK_K].filter((p) => p.wing === wing),
      loading: false,
    })

    const user = userEvent.setup()
    renderPage()
    await fillThroughToReview(user)

    expect(mockComputeWalkingRoute).not.toHaveBeenCalled()
    expect(screen.queryByText(/km ·/)).not.toBeInTheDocument()
  })

  it('posts a custom pin with distance computed via compute_walking_route_custom, not the catalog RPC', async () => {
    mockComputeWalkingRouteCustom.mockResolvedValue({ distanceKm: 0.3, geometry: null, etaMinutes: 4 })
    mockCreateOrder.mockResolvedValue({ id: 'order-1' })

    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'One Food World' }))
    await user.type(screen.getByLabelText('Items'), '2x Chicken Burger')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await user.click(screen.getByRole('button', { name: /drop a pin/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Simulate map tap' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Simulate map tap' }))
    await user.type(screen.getByLabelText(/note for the deliverer/i), 'Outside TT Tower')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: '₹50' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(mockComputeWalkingRouteCustom).toHaveBeenCalledWith('point-one-food', 12.9705, 79.1601))
    expect(mockComputeWalkingRoute).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Post this request' }))

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery_location: { type: 'campus', label: 'Outside TT Tower' },
        pickup_point_id: 'point-one-food',
        delivery_point_id: null,
        custom_delivery_lat: 12.9705,
        custom_delivery_lng: 79.1601,
        custom_delivery_note: 'Outside TT Tower',
        distance_km: 0.3,
      })
    ))
  })

  it('resets loading and stays interactive when posting fails', async () => {
    mockCreateOrder.mockRejectedValue(new Error('Network error'))
    const user = userEvent.setup()
    renderPage()
    await fillThroughToReview(user)

    const postButton = screen.getByRole('button', { name: 'Post this request' })
    await user.click(postButton)

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/couldn.t post it/i) })
    ))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Post this request' })).toBeEnabled())
    expect(screen.getByText('4 / 4')).toBeInTheDocument()
  })

  it('never fires a second create-order call while a submission is already in flight', async () => {
    let resolveCreate: (v: unknown) => void
    mockCreateOrder.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve }))
    const user = userEvent.setup()
    renderPage()
    await fillThroughToReview(user)

    const postButton = screen.getByRole('button', { name: 'Post this request' })
    await user.click(postButton)
    await user.click(postButton) // second click while the first request is still in flight

    resolveCreate!({ id: 'order-1' })
    await waitFor(() => expect(screen.getByText(/it.s on the board/i)).toBeInTheDocument())
    expect(mockCreateOrder).toHaveBeenCalledTimes(1)
  })

  it('resets to step 1 when posting another request', async () => {
    mockCreateOrder.mockResolvedValue({ id: 'order-1' })
    const user = userEvent.setup()
    renderPage()
    await fillThroughToReview(user)
    await user.click(screen.getByRole('button', { name: 'Post this request' }))
    await waitFor(() => expect(screen.getByText(/it.s on the board/i)).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Post another request' }))

    expect(screen.getByText('1 / 4')).toBeInTheDocument()
    expect(screen.getByLabelText('Items')).toHaveValue('')
  })

  it('redirects to login instead of posting when the session is gone', async () => {
    mockUseAuth.mockReturnValue({ user: null })
    const user = userEvent.setup()
    renderPage()
    await fillThroughToReview(user)

    await user.click(screen.getByRole('button', { name: 'Post this request' }))

    expect(mockCreateOrder).not.toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })
})
