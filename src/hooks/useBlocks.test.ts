import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createSupabaseMock, createQueryBuilder } from '@/test/supabaseMock'

const supabaseMock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return supabaseMock
  },
}))

const { useBlocks } = await import('./useBlocks')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useBlocks', () => {
  it('fetchMyBlocks returns the caller\'s own outgoing blocks', async () => {
    const rows = [{ id: 'b1', blocker_id: 'me', blocked_id: 'other-1', created_at: '2026-08-28T10:00:00.000Z' }]
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: rows, error: null }))
    const { result } = renderHook(() => useBlocks())

    const blocks = await result.current.fetchMyBlocks()
    expect(blocks).toEqual(rows)
    expect(supabaseMock.from).toHaveBeenCalledWith('blocks')
  })

  it('fetchMyBlocks returns an empty array on error rather than throwing', async () => {
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: null, error: { message: 'nope' } }))
    const { result } = renderHook(() => useBlocks())

    await expect(result.current.fetchMyBlocks()).resolves.toEqual([])
  })

  it('isBlocked resolves true when a matching row exists', async () => {
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: { id: 'b1' }, error: null }))
    const { result } = renderHook(() => useBlocks())

    await expect(result.current.isBlocked('other-1')).resolves.toBe(true)
  })

  it('isBlocked resolves false when no row exists', async () => {
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: null, error: null }))
    const { result } = renderHook(() => useBlocks())

    await expect(result.current.isBlocked('other-1')).resolves.toBe(false)
  })

  it('blockUser calls block_user with the target id', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null })
    const { result } = renderHook(() => useBlocks())

    await result.current.blockUser('other-1')
    expect(supabaseMock.rpc).toHaveBeenCalledWith('block_user', { p_blocked_id: 'other-1' })
  })

  it('blockUser surfaces the self-block exception message', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'You cannot block yourself' } })
    const { result } = renderHook(() => useBlocks())

    await expect(result.current.blockUser('me')).rejects.toThrow(/cannot block yourself/i)
  })

  it('unblockUser calls unblock_user with the target id', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null })
    const { result } = renderHook(() => useBlocks())

    await result.current.unblockUser('other-1')
    expect(supabaseMock.rpc).toHaveBeenCalledWith('unblock_user', { p_blocked_id: 'other-1' })
  })
})
