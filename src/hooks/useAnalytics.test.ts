import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createSupabaseMock } from '@/test/supabaseMock'

const supabaseMock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return supabaseMock
  },
}))

const { useAnalytics } = await import('./useAnalytics')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAnalytics - getMyActivitySummary', () => {
  it('calls get_my_activity_summary with no params (server scopes to auth.uid() itself)', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{
        posted_count: 3, posted_delivered_count: 2, posted_cancelled_count: 1,
        accepted_count: 5, completed_deliveries: 4, deliveries_cancelled_count: 1,
        avg_tip_given: 25.5, avg_tip_earned: 30,
      }],
      error: null,
    })
    const { result } = renderHook(() => useAnalytics())

    let summary
    await act(async () => {
      summary = await result.current.getMyActivitySummary()
    })

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_my_activity_summary')
    expect(summary).toEqual({
      posted_count: 3, posted_delivered_count: 2, posted_cancelled_count: 1,
      accepted_count: 5, completed_deliveries: 4, deliveries_cancelled_count: 1,
      avg_tip_given: 25.5, avg_tip_earned: 30,
    })
  })

  it('returns null on an RPC error rather than throwing', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => useAnalytics())

    let summary
    await act(async () => {
      summary = await result.current.getMyActivitySummary()
    })

    expect(summary).toBeNull()
  })

  it('returns null when the RPC returns an empty result set (defensive, should not happen in practice)', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: [], error: null })
    const { result } = renderHook(() => useAnalytics())

    let summary
    await act(async () => {
      summary = await result.current.getMyActivitySummary()
    })

    expect(summary).toBeNull()
  })
})

describe('useAnalytics - getCampusOrderVolume', () => {
  it('calls get_campus_order_volume with the requested day window', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: [{ day: '2026-08-27', total_orders: 4, delivered_orders: 3, cancelled_orders: 1 }], error: null })
    const { result } = renderHook(() => useAnalytics())

    let volume
    await act(async () => {
      volume = await result.current.getCampusOrderVolume(14)
    })

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_campus_order_volume', { p_days: 14 })
    expect(volume).toEqual([{ day: '2026-08-27', total_orders: 4, delivered_orders: 3, cancelled_orders: 1 }])
  })

  it('defaults to a 30-day window when not specified', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: [], error: null })
    const { result } = renderHook(() => useAnalytics())

    await act(async () => {
      await result.current.getCampusOrderVolume()
    })

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_campus_order_volume', { p_days: 30 })
  })

  it('returns an empty array on error rather than throwing', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => useAnalytics())

    let volume
    await act(async () => {
      volume = await result.current.getCampusOrderVolume()
    })

    expect(volume).toEqual([])
  })
})

describe('useAnalytics - getPopularLocations', () => {
  it('calls get_popular_locations with the requested limit', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{ campus_point_id: 'p1', label: 'One Food World', pickup_count: 10, delivery_count: 2, total_count: 12 }],
      error: null,
    })
    const { result } = renderHook(() => useAnalytics())

    let locations
    await act(async () => {
      locations = await result.current.getPopularLocations(5)
    })

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_popular_locations', { p_limit: 5 })
    expect(locations).toEqual([{ campus_point_id: 'p1', label: 'One Food World', pickup_count: 10, delivery_count: 2, total_count: 12 }])
  })

  it('returns an empty array on error rather than throwing', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => useAnalytics())

    let locations
    await act(async () => {
      locations = await result.current.getPopularLocations()
    })

    expect(locations).toEqual([])
  })
})

describe('useAnalytics - getBusyHours', () => {
  it('calls get_busy_hours with no params', async () => {
    const allHours = Array.from({ length: 24 }, (_, h) => ({ hour_of_day: h, order_count: 0 }))
    supabaseMock.rpc.mockResolvedValue({ data: allHours, error: null })
    const { result } = renderHook(() => useAnalytics())

    let hours
    await act(async () => {
      hours = await result.current.getBusyHours()
    })

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_busy_hours')
    expect(hours).toHaveLength(24)
  })

  it('returns an empty array on error rather than throwing', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => useAnalytics())

    let hours
    await act(async () => {
      hours = await result.current.getBusyHours()
    })

    expect(hours).toEqual([])
  })
})
