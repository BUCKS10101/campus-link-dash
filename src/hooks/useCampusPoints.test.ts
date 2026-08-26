import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createQueryBuilder, createSupabaseMock } from '@/test/supabaseMock'

const supabaseMock = createSupabaseMock()

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return supabaseMock
  },
}))

const { useCampusPoints } = await import('./useCampusPoints')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useCampusPoints', () => {
  it('loads active campus points and resolves them by key', async () => {
    const points = [
      { id: 'p1', key: 'hostel-block-b', label: 'Block B', kind: 'accommodation', lat: 12.9745, lng: 79.1575 },
      { id: 'p2', key: 'hostel-block-t', label: 'Block T', kind: 'accommodation', lat: 12.9748, lng: 79.1658 },
    ]
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: points, error: null }))

    const { result } = renderHook(() => useCampusPoints())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.points).toEqual(points)
    expect(result.current.byKey('hostel-block-b')).toEqual(points[0])
  })

  it('groups points by category and sorts alphabetically within it', async () => {
    const points = [
      { id: 'p1', key: 'one-food', label: 'One Food', kind: 'food', lat: 12.9762, lng: 79.1617 },
      { id: 'p2', key: 'hostel-block-b', label: 'Block B', kind: 'accommodation', lat: 12.9745, lng: 79.1575 },
      { id: 'p3', key: 'canteen', label: 'Canteen', kind: 'food', lat: 12.9705, lng: 79.1545 },
    ]
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: points, error: null }))

    const { result } = renderHook(() => useCampusPoints())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.byCategory('food').map((p) => p.label)).toEqual(['Canteen', 'One Food'])
    expect(result.current.byCategory('accommodation').map((p) => p.label)).toEqual(['Block B'])
    expect(result.current.byCategory('medical')).toEqual([])
  })

  it('treats Men’s and Ladies wings as distinct campus points, never merging or inferring one from the other', async () => {
    const mensA = { id: 'p-mens-a', key: 'hostel-mens-a', label: "Men's Hostel A", kind: 'accommodation', wing: 'mens', lat: 12.9700, lng: 79.1500 }
    const ladiesA = { id: 'p-ladies-a', key: 'hostel-ladies-a', label: 'Ladies Hostel A', kind: 'accommodation', wing: 'ladies', lat: 12.9800, lng: 79.1600 }
    const mgb = { id: 'p-mgb', key: 'mgb', label: 'Mahatma Gandhi Block (MGB)', kind: 'accommodation', wing: null, lat: 12.9720, lng: 79.1679 }
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: [mensA, ladiesA, mgb], error: null }))

    const { result } = renderHook(() => useCampusPoints())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.byWing('mens')).toEqual([mensA])
    expect(result.current.byWing('ladies')).toEqual([ladiesA])
    expect(result.current.byWing(null)).toEqual([mgb])

    // Same letter, genuinely different physical locations - never equal,
    // never sharing an id, never sharing coordinates.
    expect(mensA.id).not.toBe(ladiesA.id)
    expect(mensA.lat).not.toBe(ladiesA.lat)
    expect(mensA.lng).not.toBe(ladiesA.lng)
  })

  it('returns undefined from byKey for a point with no seeded coordinate yet, instead of throwing', async () => {
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: [], error: null }))

    const { result } = renderHook(() => useCampusPoints())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.byKey('one-food')).toBeUndefined()
  })

  it('surfaces a fetch error as an empty list instead of crashing', async () => {
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: null, error: { message: 'network error' } }))

    const { result } = renderHook(() => useCampusPoints())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.points).toEqual([])
  })
})
