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

  it('loads messages for an authorized order', async () => {
    const messages = [{ id: '1', order_id: 'order-1', sender_id: 'u1', sender_type: 'customer', message: 'hi', created_at: new Date().toISOString() }]
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: messages, error: null }))

    const { result } = renderHook(() => useChat('order-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBeNull()
    expect(result.current.messages).toEqual(messages)
  })

  it('sendMessage rejects an empty message before hitting the DB', async () => {
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: [], error: null }))

    const { result } = renderHook(() => useChat('order-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const fromCallsBefore = supabaseMock.from.mock.calls.length

    await expect(
      act(async () => {
        await result.current.sendMessage('   ', 'u1', 'customer')
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
        await result.current.sendMessage('a'.repeat(1001), 'u1', 'customer')
      })
    ).rejects.toThrow(/under 1000 characters/i)
  })
})
