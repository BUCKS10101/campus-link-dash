import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { createQueryBuilder, createSupabaseMock } from '@/test/supabaseMock'

const supabaseMock = createSupabaseMock()

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return supabaseMock
  },
}))

const { useChat } = await import('./useChat')

beforeEach(() => {
  vi.clearAllMocks()
  supabaseMock.channel.mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  })
})

describe('useChat', () => {
  it('surfaces a fetch error instead of crashing on unauthorized order access', async () => {
    supabaseMock.from.mockReturnValue(
      createQueryBuilder({ data: null, error: { message: 'permission denied for table chat_messages' } })
    )

    const { result } = renderHook(() => useChat('order-not-mine'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toMatch(/permission denied/i)
    expect(result.current.messages).toEqual([])
  })

  it('leaks nothing to an outsider viewing a real order they are not part of - RLS filters rows, not an error', async () => {
    // chat_select_participant filters rows rather than erroring for an
    // authenticated-but-unrelated viewer on a real order id - the request
    // succeeds with zero rows, never exposing the participants' messages.
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: [], error: null }))

    const { result } = renderHook(() => useChat('someone-elses-order'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBeNull()
    expect(result.current.messages).toEqual([])
  })

  it('surfaces sendMessage rejection when chat_insert_participant denies a non-participant', async () => {
    supabaseMock.from.mockReturnValue(
      createQueryBuilder({ data: null, error: { message: 'new row violates row-level security policy for table "chat_messages"' } })
    )

    const { result } = renderHook(() => useChat('someone-elses-order'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(async () => {
        await result.current.sendMessage('trying to butt in', 'outsider-id')
      })
    ).rejects.toThrow(/row-level security/i)
  })

  it('loads messages for an authorized order', async () => {
    // chat_messages has no sender_type column live - bubble alignment is
    // derived from sender_id in MyOrders.tsx, not a stored role.
    const messages = [{ id: '1', order_id: 'order-1', sender_id: 'u1', message: 'hi', created_at: new Date().toISOString() }]
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: messages, error: null }))

    const { result } = renderHook(() => useChat('order-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBeNull()
    expect(result.current.messages).toEqual(messages)
  })

  it('sendMessage inserts sender_id/message only, no sender_type column', async () => {
    const builder = createQueryBuilder({ data: [{ id: '2' }], error: null })
    supabaseMock.from.mockReturnValue(builder)

    const { result } = renderHook(() => useChat('order-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.sendMessage('On my way!', 'u1')
    })

    const inserted = vi.mocked(builder.insert).mock.calls[0][0][0]
    expect(inserted).toEqual({ order_id: 'order-1', sender_id: 'u1', message: 'On my way!' })
    expect(inserted).not.toHaveProperty('sender_type')
  })

  it('sendMessage rejects an empty message before hitting the DB', async () => {
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: [], error: null }))

    const { result } = renderHook(() => useChat('order-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const fromCallsBefore = supabaseMock.from.mock.calls.length

    await expect(
      act(async () => {
        await result.current.sendMessage('   ', 'u1')
      })
    ).rejects.toThrow(/cannot be empty/i)

    expect(supabaseMock.from.mock.calls.length).toBe(fromCallsBefore)
  })

  it('sendMessage rejects a message over 1000 characters', async () => {
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: [], error: null }))

    const { result } = renderHook(() => useChat('order-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(async () => {
        await result.current.sendMessage('a'.repeat(1001), 'u1')
      })
    ).rejects.toThrow(/under 1000 characters/i)
  })
})
