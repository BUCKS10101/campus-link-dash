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

describe('fetchOrders column safety', () => {
  it('selects only valid live columns and never requests otp', async () => {
    const builder = createQueryBuilder({ data: [], error: null })
    supabaseMock.from.mockReturnValue(builder)

    const { result } = renderHook(() => useOrders())
    await act(async () => {
      await result.current.fetchOrders()
    })

    const selectArg = builder.select.mock.calls[0][0] as string
    expect(selectArg).toMatch(/requester_id/)
    expect(selectArg).toMatch(/deliverer_id/)
    expect(selectArg).toMatch(/distance_km/)
    expect(selectArg).toMatch(/distance_source/)
    expect(selectArg).toMatch(/orders_requester_id_fkey/)
    expect(selectArg).not.toMatch(/\botp\b/)
    expect(selectArg).not.toMatch(/customer_id/)
    expect(selectArg).not.toMatch(/otp_code/)
    expect(selectArg).not.toMatch(/\bprice\b/)
    expect(selectArg).not.toMatch(/pickup_location/)
    expect(selectArg).not.toMatch(/restaurant_icon/)
    expect(selectArg).not.toMatch(/items_description/)
    expect(selectArg).not.toMatch(/\bdistance\b(?!_km)/)
  })

  it('uses requester_id/addressee_id (not user_id/friend_id) for the friendsOnly lookup', async () => {
    const ordersBuilder = createQueryBuilder({ data: [], error: null })
    const friendshipsBuilder = createQueryBuilder({ data: [], error: null })
    supabaseMock.from.mockImplementation((table: string) =>
      table === 'friendships' ? friendshipsBuilder : ordersBuilder
    )

    const { result } = renderHook(() => useOrders())
    await act(async () => {
      await result.current.fetchOrders({ friendsOnly: true, viewerId: 'viewer-1' })
    })

    expect(friendshipsBuilder.select).toHaveBeenCalledWith('addressee_id')
    expect(friendshipsBuilder.eq).toHaveBeenCalledWith('requester_id', 'viewer-1')
  })
})

describe('createOrder', () => {
  it('inserts using the live column names and rejects the old ones', async () => {
    const builder = createQueryBuilder({ data: [{ id: 'order-1' }], error: null })
    supabaseMock.from.mockReturnValue(builder)

    const { result } = renderHook(() => useOrders())

    await act(async () => {
      await result.current.createOrder({
        requester_id: '11111111-1111-1111-1111-111111111111',
        deliverer_id: null,
        restaurant_name: 'One Food',
        items: ['2x Burger'],
        tip_amount: 30,
        delivery_location: { type: 'campus', label: 'TT Block' },
        distance_km: 1.2,
        distance_source: 'routed',
        pickup_point_id: null,
        delivery_point_id: null,
        custom_delivery_lat: null,
        custom_delivery_lng: null,
        custom_delivery_note: null,
        status: 'pending',
      })
    })

    expect(builder.insert).toHaveBeenCalledTimes(1)
    const inserted = vi.mocked(builder.insert).mock.calls[0][0][0]

    expect(inserted).toMatchObject({
      requester_id: '11111111-1111-1111-1111-111111111111',
      restaurant_name: 'One Food',
      items: ['2x Burger'],
      delivery_location: { type: 'campus', label: 'TT Block' },
    })
    // otp is generated client-side at creation time (no DB default) - only
    // its SELECT is locked down, not its INSERT.
    expect(inserted.otp).toMatch(/^\d{6}$/)
    expect(inserted).not.toHaveProperty('customer_id')
    expect(inserted).not.toHaveProperty('otp_code')
    expect(inserted).not.toHaveProperty('price')
    expect(inserted).not.toHaveProperty('pickup_location')
    expect(inserted).not.toHaveProperty('restaurant_icon')
    expect(inserted).not.toHaveProperty('items_description')
  })

  it('rejects invalid order data before ever calling the DB (e.g. empty items)', async () => {
    const { result } = renderHook(() => useOrders())

    await expect(
      act(async () => {
        await result.current.createOrder({
          requester_id: '11111111-1111-1111-1111-111111111111',
          deliverer_id: null,
          restaurant_name: 'One Food',
          items: [],
          tip_amount: 30,
          delivery_location: { type: 'campus', label: 'TT Block' },
          distance_km: 1.2,
          distance_source: 'routed',
          status: 'pending',
        })
      })
    ).rejects.toThrow()

    expect(supabaseMock.from).not.toHaveBeenCalled()
  })
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

  it('scopes the self-accept guard to requester_id, not customer_id', async () => {
    const builder = createQueryBuilder({ data: { id: 'order-1' }, error: null })
    supabaseMock.from.mockReturnValue(builder)

    const { result } = renderHook(() => useOrders())
    await act(async () => {
      await result.current.acceptOrder('order-1', 'deliverer-1')
    })

    expect(builder.neq).toHaveBeenCalledWith('requester_id', 'deliverer-1')
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

describe('cancelOrder', () => {
  // Phase 3G - see PHASE3_3G_DELIVERY_LIFECYCLE_SPEC.md. A single
  // conditional UPDATE, not a read-then-write - there is no separate
  // fetch to mock here, unlike updateOrderStatus above. The real
  // authorization/race-safety backstop is the DB (RLS + the transition
  // trigger); these tests only verify the client issues the correct
  // one-statement filter and handles a 0-row result as a clean rejection.

  it('cancels as the requester with the requester-scoped filter', async () => {
    const builder = createQueryBuilder({ data: [{ id: 'order-1', status: 'cancelled' }], error: null })
    supabaseMock.from.mockReturnValue(builder)

    const { result } = renderHook(() => useOrders())
    let returned: unknown
    await act(async () => {
      returned = await result.current.cancelOrder('order-1', 'requester', 'customer-1')
    })

    expect(builder.update).toHaveBeenCalledWith({ status: 'cancelled' })
    expect(builder.eq).toHaveBeenCalledWith('id', 'order-1')
    expect(builder.eq).toHaveBeenCalledWith('requester_id', 'customer-1')
    expect(builder.in).toHaveBeenCalledWith('status', ['pending', 'accepted'])
    expect(returned).toEqual({ id: 'order-1', status: 'cancelled' })
  })

  it('cancels as the deliverer with the deliverer-scoped filter, restricted to accepted only', async () => {
    const builder = createQueryBuilder({ data: [{ id: 'order-2', status: 'cancelled' }], error: null })
    supabaseMock.from.mockReturnValue(builder)

    const { result } = renderHook(() => useOrders())
    await act(async () => {
      await result.current.cancelOrder('order-2', 'deliverer', 'deliverer-1')
    })

    expect(builder.eq).toHaveBeenCalledWith('deliverer_id', 'deliverer-1')
    // Corrected rule: once picked_up, the deliverer already has the item -
    // normal cancellation is no longer offered, so 'picked_up'/
    // 'out_for_delivery' must NOT appear in this filter. See
    // PHASE3_3G_DELIVERY_LIFECYCLE_SPEC.md's corrected matrix.
    expect(builder.in).toHaveBeenCalledWith('status', ['accepted'])
  })

  it('never writes cancelled_at/cancelled_by from the client - only status', async () => {
    const builder = createQueryBuilder({ data: [{ id: 'order-1', status: 'cancelled' }], error: null })
    supabaseMock.from.mockReturnValue(builder)

    const { result } = renderHook(() => useOrders())
    await act(async () => {
      await result.current.cancelOrder('order-1', 'requester', 'customer-1')
    })

    expect(builder.update).toHaveBeenCalledWith({ status: 'cancelled' })
    expect(builder.update).not.toHaveBeenCalledWith(expect.objectContaining({ cancelled_at: expect.anything() }))
    expect(builder.update).not.toHaveBeenCalledWith(expect.objectContaining({ cancelled_by: expect.anything() }))
  })

  it('rejects with a clear, refresh-oriented message when zero rows match (already moved on, race lost, or terminal)', async () => {
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: [], error: null }))

    const { result } = renderHook(() => useOrders())

    await expect(
      act(async () => {
        await result.current.cancelOrder('order-1', 'requester', 'customer-1')
      })
    ).rejects.toThrow(/already moved on|refresh/i)
  })

  it('propagates a hard DB error (e.g. RLS/constraint rejection) rather than swallowing it', async () => {
    supabaseMock.from.mockReturnValue(
      createQueryBuilder({ data: null, error: { message: 'permission denied' } })
    )

    const { result } = renderHook(() => useOrders())

    await expect(
      act(async () => {
        await result.current.cancelOrder('order-1', 'requester', 'customer-1')
      })
    ).rejects.toThrow(/permission denied/i)
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

describe('computeDistance', () => {
  it('returns the server-computed distance for two seeded campus points', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 0.9, error: null })

    const { result } = renderHook(() => useOrders())

    let km: number | null = null
    await act(async () => {
      km = await result.current.computeDistance('pickup-id', 'delivery-id')
    })

    expect(km).toBe(0.9)
    expect(supabaseMock.rpc).toHaveBeenCalledWith('compute_order_distance', {
      p_pickup_id: 'pickup-id',
      p_delivery_id: 'delivery-id',
    })
  })

  // Normal, expected case for most current point combinations - most of the
  // ~31 named pickup/hostel/landmark options aren't seeded yet (see
  // PHASE3_3A_ARCHITECTURE_PROPOSAL.md), so the RPC's "Unknown or inactive"
  // exception is routine, not a bug. Must resolve to null, not throw -
  // callers show no distance line rather than an error toast for this.
  it('returns null instead of throwing when a point has no seeded coordinate yet', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'Unknown or inactive pickup point' } })

    const { result } = renderHook(() => useOrders())

    let km: number | null = 999
    await act(async () => {
      km = await result.current.computeDistance('pickup-id', 'delivery-id')
    })

    expect(km).toBeNull()
  })
})

describe('computeWalkingRoute', () => {
  it('returns the real route distance, geometry, and ETA for two seeded points', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{ distance_km: 0.86, geometry: { type: 'LineString', coordinates: [[79.16, 12.97], [79.165, 12.974]] }, eta_minutes: 10.3 }],
      error: null,
    })

    const { result } = renderHook(() => useOrders())

    let route: Awaited<ReturnType<typeof result.current.computeWalkingRoute>> = null
    await act(async () => {
      route = await result.current.computeWalkingRoute('pickup-id', 'delivery-id')
    })

    expect(route).toEqual({
      distanceKm: 0.86,
      geometry: { type: 'LineString', coordinates: [[79.16, 12.97], [79.165, 12.974]] },
      etaMinutes: 10.3,
    })
    expect(supabaseMock.rpc).toHaveBeenCalledWith('compute_walking_route', {
      p_pickup_id: 'pickup-id',
      p_delivery_id: 'delivery-id',
    })
  })

  it('returns null instead of throwing when a point has no seeded coordinate yet', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'Unknown or inactive pickup point' } })

    const { result } = renderHook(() => useOrders())

    let route: Awaited<ReturnType<typeof result.current.computeWalkingRoute>> = { distanceKm: 999, geometry: null, etaMinutes: 999 }
    await act(async () => {
      route = await result.current.computeWalkingRoute('pickup-id', 'delivery-id')
    })

    expect(route).toBeNull()
  })
})
