import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createSupabaseMock } from '@/test/supabaseMock'

const supabaseMock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return supabaseMock
  },
}))

const { useReports } = await import('./useReports')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useReports', () => {
  it('fileReport calls file_report with reason/description/order id', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'report-1', error: null })
    const { result } = renderHook(() => useReports())

    const id = await result.current.fileReport('other-1', 'harassment', 'they were rude', 'order-1')
    expect(id).toBe('report-1')
    expect(supabaseMock.rpc).toHaveBeenCalledWith('file_report', {
      p_reported_user_id: 'other-1',
      p_order_id: 'order-1',
      p_reason: 'harassment',
      p_description: 'they were rude',
    })
  })

  it('defaults order id to null and description to null when omitted', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'report-2', error: null })
    const { result } = renderHook(() => useReports())

    await result.current.fileReport('other-1', 'other')
    expect(supabaseMock.rpc).toHaveBeenCalledWith('file_report', {
      p_reported_user_id: 'other-1',
      p_order_id: null,
      p_reason: 'other',
      p_description: null,
    })
  })

  it('surfaces the self-report exception message', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'You cannot report yourself' } })
    const { result } = renderHook(() => useReports())

    await expect(result.current.fileReport('me', 'other')).rejects.toThrow(/cannot report yourself/i)
  })

  it('surfaces the rate-limit exception message', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'You have reported the maximum number of times today' } })
    const { result } = renderHook(() => useReports())

    await expect(result.current.fileReport('other-1', 'harassment')).rejects.toThrow(/maximum number of times/i)
  })
})
