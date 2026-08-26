import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createSupabaseMock } from '@/test/supabaseMock'

const supabaseMock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return supabaseMock
  },
}))

const { useRatings } = await import('./useRatings')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRatings - submitRating', () => {
  it('calls submit_rating with the validated score/order/comment, never trusting a reviewee id from the caller', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'rating-1', error: null })
    const { result } = renderHook(() => useRatings())

    await act(async () => {
      await result.current.submitRating('order-1', 5, 'Great!')
    })

    expect(supabaseMock.rpc).toHaveBeenCalledWith('submit_rating', {
      p_order_id: 'order-1',
      p_score: 5,
      p_comment: 'Great!',
    })
  })

  it('sends null for an empty comment rather than an empty string', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'rating-1', error: null })
    const { result } = renderHook(() => useRatings())

    await act(async () => {
      await result.current.submitRating('order-1', 4, '')
    })

    expect(supabaseMock.rpc).toHaveBeenCalledWith('submit_rating', {
      p_order_id: 'order-1',
      p_score: 4,
      p_comment: null,
    })
  })

  it('rejects an out-of-range score before ever calling the RPC', async () => {
    const { result } = renderHook(() => useRatings())

    await expect(result.current.submitRating('order-1', 7, '')).rejects.toThrow(/star rating/i)
    expect(supabaseMock.rpc).not.toHaveBeenCalled()
  })

  it('rejects a comment over 300 characters before ever calling the RPC', async () => {
    const { result } = renderHook(() => useRatings())

    await expect(result.current.submitRating('order-1', 5, 'a'.repeat(301))).rejects.toThrow(/300 characters/i)
    expect(supabaseMock.rpc).not.toHaveBeenCalled()
  })

  it('surfaces the server rejection message (e.g. duplicate rating) to the caller', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'You already rated this order' } })
    const { result } = renderHook(() => useRatings())

    await expect(result.current.submitRating('order-1', 5, '')).rejects.toThrow(/already rated/i)
  })

  it('tracks a submitting flag across the call', async () => {
    let resolveRpc: (v: unknown) => void = () => {}
    supabaseMock.rpc.mockReturnValue(new Promise((resolve) => { resolveRpc = resolve }))
    const { result } = renderHook(() => useRatings())

    expect(result.current.submitting).toBe(false)
    let submitPromise: Promise<void>
    act(() => {
      submitPromise = result.current.submitRating('order-1', 5, '')
    })
    await waitFor(() => expect(result.current.submitting).toBe(true))

    resolveRpc({ data: 'rating-1', error: null })
    await act(async () => {
      await submitPromise
    })
    expect(result.current.submitting).toBe(false)
  })
})

describe('useRatings - fetchMyRatedOrderIds', () => {
  it('returns a set of order ids the caller has already rated', async () => {
    supabaseMock.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [{ order_id: 'order-1' }, { order_id: 'order-2' }], error: null }),
    })
    const { result } = renderHook(() => useRatings())

    const ids = await result.current.fetchMyRatedOrderIds('user-1')
    expect(ids).toEqual(new Set(['order-1', 'order-2']))
  })

  it('returns an empty set on a query error instead of throwing', async () => {
    supabaseMock.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'network error' } }),
    })
    const { result } = renderHook(() => useRatings())

    const ids = await result.current.fetchMyRatedOrderIds('user-1')
    expect(ids).toEqual(new Set())
  })
})

describe('useRatings - getProfileReputation', () => {
  it('returns the aggregate row from get_profile_reputation', async () => {
    const reputation = { avg_rating: 4.8, rating_count: 17, completed_deliveries: 23 }
    supabaseMock.rpc.mockResolvedValue({ data: [reputation], error: null })
    const { result } = renderHook(() => useRatings())

    const got = await result.current.getProfileReputation('user-1')
    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_profile_reputation', { p_profile_id: 'user-1' })
    expect(got).toEqual(reputation)
  })

  it('returns null on error rather than a fabricated reputation', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'network error' } })
    const { result } = renderHook(() => useRatings())

    const got = await result.current.getProfileReputation('user-1')
    expect(got).toBeNull()
  })
})
