import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { createSupabaseMock } from '@/test/supabaseMock'

const supabaseMock = createSupabaseMock()

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return supabaseMock
  },
}))

const { usePublishDeliveryLocation, useDeliveryLocation } = await import('./useDeliveryLocation')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('usePublishDeliveryLocation', () => {
  // Each test defines its own navigator.geolocation stub before rendering
  // rather than restoring one in an afterEach here: this describe block is
  // nested inside the file, so a local afterEach would run BEFORE
  // Testing Library's own global unmount cleanup (afterEach hooks unwind
  // innermost-first) - wiping the stub out from under a hook that's still
  // mounted and about to run its cleanup effect.
  it('does not touch geolocation or the channel until explicitly enabled', () => {
    const watchPosition = vi.fn()
    Object.defineProperty(navigator, 'geolocation', { value: { watchPosition, clearWatch: vi.fn() }, configurable: true })

    renderHook(() => usePublishDeliveryLocation('order-1', false))

    expect(watchPosition).not.toHaveBeenCalled()
    expect(supabaseMock.channel).not.toHaveBeenCalled()
  })

  it('publishes to the order-scoped topic once enabled', () => {
    const watchPosition = vi.fn((success: (pos: unknown) => void) => {
      success({ coords: { latitude: 12.97, longitude: 79.16 } })
      return 1
    })
    Object.defineProperty(navigator, 'geolocation', { value: { watchPosition, clearWatch: vi.fn() }, configurable: true })
    const channel = { subscribe: vi.fn().mockReturnThis(), send: vi.fn(), on: vi.fn().mockReturnThis() }
    supabaseMock.channel.mockReturnValue(channel)

    renderHook(() => usePublishDeliveryLocation('order-1', true))

    expect(supabaseMock.channel).toHaveBeenCalledWith('order-location-order-1', { config: { private: true } })
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'broadcast',
      event: 'location',
      payload: expect.objectContaining({ lat: 12.97, lng: 79.16 }),
    }))
  })

  it('surfaces a readable error when geolocation is denied, instead of crashing', () => {
    const watchPosition = vi.fn((_success: unknown, error: (err: unknown) => void) => {
      error({ code: 1 })
      return 1
    })
    Object.defineProperty(navigator, 'geolocation', { value: { watchPosition, clearWatch: vi.fn() }, configurable: true })
    supabaseMock.channel.mockReturnValue({ subscribe: vi.fn().mockReturnThis(), send: vi.fn(), on: vi.fn().mockReturnThis() })

    const { result } = renderHook(() => usePublishDeliveryLocation('order-1', true))

    expect(result.current.error).toMatch(/location/i)
  })

  it('stops watching and tears down the channel when disabled again', () => {
    const clearWatch = vi.fn()
    const watchPosition = vi.fn(() => 42)
    Object.defineProperty(navigator, 'geolocation', { value: { watchPosition, clearWatch }, configurable: true })
    const channel = { subscribe: vi.fn().mockReturnThis(), send: vi.fn(), on: vi.fn().mockReturnThis() }
    supabaseMock.channel.mockReturnValue(channel)

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => usePublishDeliveryLocation('order-1', enabled),
      { initialProps: { enabled: true } },
    )
    rerender({ enabled: false })

    expect(clearWatch).toHaveBeenCalledWith(42)
    expect(supabaseMock.removeChannel).toHaveBeenCalledWith(channel)
  })
})

describe('useDeliveryLocation', () => {
  it('does not subscribe while disabled', () => {
    renderHook(() => useDeliveryLocation('order-1', false))
    expect(supabaseMock.channel).not.toHaveBeenCalled()
  })

  it('receives a broadcast position while enabled', async () => {
    let broadcastHandler: ((arg: { payload: unknown }) => void) | undefined
    const channel = {
      on: vi.fn((_type: string, _filter: { event: string }, cb: (arg: { payload: unknown }) => void) => {
        broadcastHandler = cb
        return channel
      }),
      subscribe: vi.fn().mockReturnThis(),
    }
    supabaseMock.channel.mockReturnValue(channel)

    const { result } = renderHook(() => useDeliveryLocation('order-1', true))

    expect(supabaseMock.channel).toHaveBeenCalledWith('order-location-order-1', { config: { private: true } })

    act(() => {
      broadcastHandler?.({ payload: { lat: 12.97, lng: 79.16, updatedAt: Date.now() } })
    })

    await waitFor(() => expect(result.current.location).toEqual(expect.objectContaining({ lat: 12.97, lng: 79.16 })))
    expect(result.current.stale).toBe(false)
  })
})
