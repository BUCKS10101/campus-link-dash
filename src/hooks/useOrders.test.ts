import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createQueryBuilder, createSupabaseMock } from '@/test/supabaseMock'

const supabaseMock = createSupabaseMock()

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return supabaseMock
  },
}))

// Imported after the mock so useOrders picks up the mocked client.
const { useOrders } = await import('./useOrders')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('acceptOrder', () => {
  it('rejects when the order was already accepted by someone else (or is your own order)', async () => {
    supabaseMock.from.mockReturnValue(
      createQueryBuilder({ data: null, error: { code: 'PGRST116' } })
    )

    const { result } = renderHook(() => useOrders())

    await expect(
      act(async () => {
        await result.current.acceptOrder('order-1', 'deliverer-1')
      })
    ).rejects.toThrow(/already accepted|your own order/i)
  })

  it('returns the updated order on success', async () => {
    const order = { id: 'order-1', status: 'accepted', deliverer_id: 'deliverer-1' }
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: order, error: null }))

    const { result } = renderHook(() => useOrders())

    let returned: unknown
    await act(async () => {
      returned = await result.current.acceptOrder('order-1', 'deliverer-1')
    })

    expect(returned).toEqual(order)
  })
})

describe('updateOrderStatus', () => {
  it('rejects a direct transition to delivered (must go through OTP verification)', async () => {
    const { result } = renderHook(() => useOrders())

    await expect(
      act(async () => {
        await result.current.updateOrderStatus('order-1', 'delivered', 'deliverer-1')
      })
    ).rejects.toThrow(/otp verification/i)

    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it('rejects when the caller is not the assigned deliverer', async () => {
    supabaseMock.from.mockReturnValue(
      createQueryBuilder({ data: null, error: { message: 'not found' } })
    )

    const { result } = renderHook(() => useOrders())

    await expect(
      act(async () => {
        await result.current.updateOrderStatus('order-1', 'picked_up', 'not-the-deliverer')
      })
    ).rejects.toThrow(/not the assigned deliverer/i)
  })

  it('rejects an invalid status transition (e.g. skipping a step)', async () => {
    supabaseMock.from.mockReturnValue(
      createQueryBuilder({ data: { status: 'pending' }, error: null })
    )

    const { result } = renderHook(() => useOrders())

    await expect(
      act(async () => {
        // pending -> out_for_delivery skips 'accepted' and 'picked_up'
        await result.current.updateOrderStatus('order-1', 'out_for_delivery', 'deliverer-1')
      })
    ).rejects.toThrow(/cannot move an order/i)
  })

  it('applies a valid transition', async () => {
    let call = 0
    supabaseMock.from.mockImplementation(() => {
      call += 1
      if (call === 1) {
        return createQueryBuilder({ data: { status: 'accepted' }, error: null })
      }
      return createQueryBuilder({ data: [{ id: 'order-1', status: 'picked_up' }], error: null })
    })

    const { result } = renderHook(() => useOrders())

    let updated: unknown
    await act(async () => {
      updated = await result.current.updateOrderStatus('order-1', 'picked_up', 'deliverer-1')
    })

    expect(updated).toEqual({ id: 'order-1', status: 'picked_up' })
  })
})

describe('OTP verification', () => {
  it('verifyDeliveryOtp rejects a malformed code before ever calling the DB', async () => {
    const { result } = renderHook(() => useOrders())

    await expect(
      act(async () => {
        await result.current.verifyDeliveryOtp('order-1', '123')
      })
    ).rejects.toThrow(/6-digit/i)

    expect(supabaseMock.rpc).not.toHaveBeenCalled()
  })

  it('verifyDeliveryOtp returns false on an incorrect code without throwing', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: false, error: null })

    const { result } = renderHook(() => useOrders())

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.verifyDeliveryOtp('order-1', '000000')
    })

    expect(success).toBe(false)
    expect(supabaseMock.rpc).toHaveBeenCalledWith('verify_delivery_otp', {
      p_order_id: 'order-1',
      p_code: '000000',
    })
  })

  it('verifyDeliveryOtp returns true on a correct code', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: true, error: null })

    const { result } = renderHook(() => useOrders())

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.verifyDeliveryOtp('order-1', '123456')
    })

    expect(success).toBe(true)
  })

  it('verifyDeliveryOtp propagates a DB rejection (e.g. not the assigned deliverer)', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'not the assigned deliverer' } })

    const { result } = renderHook(() => useOrders())

    await expect(
      act(async () => {
        await result.current.verifyDeliveryOtp('order-1', '123456')
      })
    ).rejects.toBeTruthy()
  })

  it('getMyOrderOtp returns the code for the customer', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: '654321', error: null })

    const { result } = renderHook(() => useOrders())

    let code: string | undefined
    await act(async () => {
      code = await result.current.getMyOrderOtp('order-1')
    })

    expect(code).toBe('654321')
    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_my_order_otp', { p_order_id: 'order-1' })
  })
})
