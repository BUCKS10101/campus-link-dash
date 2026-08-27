import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockGetCampusOrderVolume = vi.fn()
const mockGetPopularLocations = vi.fn()
const mockGetBusyHours = vi.fn()
vi.mock('@/hooks/useAnalytics', () => ({
  useAnalytics: () => ({
    getMyActivitySummary: vi.fn(),
    getCampusOrderVolume: mockGetCampusOrderVolume,
    getPopularLocations: mockGetPopularLocations,
    getBusyHours: mockGetBusyHours,
  }),
}))

const { default: Insights } = await import('./Insights')

const renderPage = () => render(<MemoryRouter><Insights /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  mockGetCampusOrderVolume.mockResolvedValue([])
  mockGetPopularLocations.mockResolvedValue([])
  mockGetBusyHours.mockResolvedValue([])
})

describe('Insights - loading and fetching', () => {
  it('fetches all three aggregate metrics on mount, exactly once', async () => {
    renderPage()
    await waitFor(() => expect(mockGetCampusOrderVolume).toHaveBeenCalledTimes(1))
    expect(mockGetPopularLocations).toHaveBeenCalledTimes(1)
    expect(mockGetBusyHours).toHaveBeenCalledTimes(1)
    expect(mockGetCampusOrderVolume).toHaveBeenCalledWith(14)
    expect(mockGetPopularLocations).toHaveBeenCalledWith(8)
  })

  it('shows a loading state before the fetches resolve', () => {
    mockGetCampusOrderVolume.mockReturnValue(new Promise(() => {})) // never resolves
    renderPage()
    expect(screen.getByText(/loading insights/i)).toBeInTheDocument()
  })
})

describe('Insights - empty states', () => {
  it('shows an honest empty state when there is no data at all, not a fabricated chart', async () => {
    renderPage()
    expect(await screen.findByText(/nothing posted in the last 14 days yet/i)).toBeInTheDocument()
    expect(screen.getByText(/no orders yet in this window/i)).toBeInTheDocument()
    expect(screen.getByText(/no location data yet/i)).toBeInTheDocument()
  })
})

describe('Insights - order volume', () => {
  it('renders a bar per day with its real count, and the correct total headline', async () => {
    mockGetCampusOrderVolume.mockResolvedValue([
      { day: '2026-08-26', total_orders: 3, delivered_orders: 2, cancelled_orders: 1 },
      { day: '2026-08-27', total_orders: 5, delivered_orders: 5, cancelled_orders: 0 },
    ])
    renderPage()

    expect(await screen.findByText(/8 errands in the last 14 days/i)).toBeInTheDocument()
    expect(screen.getByText('Aug 26')).toBeInTheDocument()
    expect(screen.getByText('Aug 27')).toBeInTheDocument()
  })
})

describe('Insights - popular locations', () => {
  it('renders each location with its pickup/delivery split, ranked by total', async () => {
    mockGetPopularLocations.mockResolvedValue([
      { campus_point_id: 'p1', label: 'One Food World', pickup_count: 10, delivery_count: 2, total_count: 12 },
      { campus_point_id: 'p2', label: "Men's Hostel A", pickup_count: 0, delivery_count: 6, total_count: 6 },
    ])
    renderPage()

    expect(await screen.findByText('One Food World')).toBeInTheDocument()
    expect(screen.getByText('10 pickup · 2 delivery')).toBeInTheDocument()
    expect(screen.getByText("Men's Hostel A")).toBeInTheDocument()
    expect(screen.getByText('0 pickup · 6 delivery')).toBeInTheDocument()
  })

  it('the popular-locations section contains only place + count, never a person', async () => {
    mockGetPopularLocations.mockResolvedValue([
      { campus_point_id: 'p1', label: 'One Food World', pickup_count: 10, delivery_count: 2, total_count: 12 },
    ])
    renderPage()

    const heading = await screen.findByText('Popular locations')
    const section = heading.closest('section')
    expect(section).not.toBeNull()
    expect(section!.textContent).not.toMatch(/requester|deliverer/i)
    expect(section!.textContent).toContain('One Food World')
  })
})

describe('Insights - busy hours', () => {
  it('only renders hours with real demand, formatted as 12-hour time', async () => {
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour_of_day: h, order_count: 0 }))
    hours[13].order_count = 4 // 1 PM
    hours[19].order_count = 7 // 7 PM
    mockGetBusyHours.mockResolvedValue(hours)
    renderPage()

    expect(await screen.findByText('1 PM')).toBeInTheDocument()
    expect(screen.getByText('7 PM')).toBeInTheDocument()
    expect(screen.queryByText('3 AM')).not.toBeInTheDocument()
  })

  it('shows an honest empty state when every hour is zero', async () => {
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour_of_day: h, order_count: 0 }))
    mockGetBusyHours.mockResolvedValue(hours)
    renderPage()

    expect(await screen.findByText(/no orders yet\./i)).toBeInTheDocument()
  })
})

describe('Insights - error state', () => {
  it('shows an error alert if a fetch rejects, not a blank/crashed page', async () => {
    mockGetCampusOrderVolume.mockRejectedValue(new Error('network down'))
    renderPage()

    expect(await screen.findByText(/couldn't load insights/i)).toBeInTheDocument()
  })
})
