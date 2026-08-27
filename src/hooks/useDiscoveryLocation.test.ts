import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDiscoveryLocation } from './useDiscoveryLocation'

const originalGeolocation = (globalThis.navigator as unknown as { geolocation?: unknown }).geolocation

const setGeolocation = (value: unknown) => {
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    value,
    configurable: true,
  })
}

const PERMISSION_DENIED = 1
const POSITION_UNAVAILABLE = 2
const TIMEOUT = 3

describe('useDiscoveryLocation', () => {
  afterEach(() => {
    setGeolocation(originalGeolocation)
    vi.restoreAllMocks()
  })

  it('is idle and calls nothing when not enabled', () => {
    const getCurrentPosition = vi.fn()
    setGeolocation({ getCurrentPosition })
    const { result } = renderHook(() => useDiscoveryLocation(false))
    expect(result.current).toEqual({ status: 'idle' })
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('reports unsupported without ever calling the geolocation API when navigator.geolocation is absent', () => {
    setGeolocation(undefined)
    const { result } = renderHook(() => useDiscoveryLocation(true))
    expect(result.current).toEqual({ status: 'unsupported' })
  })

  it('permission granted - resolves to the granted state with the real coordinates', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 12.9, longitude: 79.15, accuracy: 20 },
      } as GeolocationPosition)
    })
    setGeolocation({ getCurrentPosition })
    const { result } = renderHook(() => useDiscoveryLocation(true))

    await waitFor(() => expect(result.current.status).toBe('granted'))
    expect(result.current).toEqual({ status: 'granted', lat: 12.9, lng: 79.15, accuracyMeters: 20 })
  })

  it('permission denied - falls back to a denied state, not an unhandled error', async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
      error({ code: PERMISSION_DENIED, PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT } as GeolocationPositionError)
    })
    setGeolocation({ getCurrentPosition })
    const { result } = renderHook(() => useDiscoveryLocation(true))

    await waitFor(() => expect(result.current.status).toBe('denied'))
  })

  it('position unavailable - falls back to an unavailable state', async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
      error({ code: POSITION_UNAVAILABLE, PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT } as GeolocationPositionError)
    })
    setGeolocation({ getCurrentPosition })
    const { result } = renderHook(() => useDiscoveryLocation(true))

    await waitFor(() => expect(result.current.status).toBe('unavailable'))
  })

  it('timeout - falls back to a timeout state, distinct from denied', async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
      error({ code: TIMEOUT, PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT } as GeolocationPositionError)
    })
    setGeolocation({ getCurrentPosition })
    const { result } = renderHook(() => useDiscoveryLocation(true))

    await waitFor(() => expect(result.current.status).toBe('timeout'))
  })

  it('only ever calls getCurrentPosition - never watchPosition (no continuous tracking)', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 1, longitude: 2, accuracy: 10 } } as GeolocationPosition)
    })
    const watchPosition = vi.fn()
    setGeolocation({ getCurrentPosition, watchPosition })
    const { result } = renderHook(() => useDiscoveryLocation(true))

    await waitFor(() => expect(result.current.status).toBe('granted'))
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(watchPosition).not.toHaveBeenCalled()
  })

  it('requests a fresh position with a bounded maximumAge and timeout, not an unbounded/continuous read', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 1, longitude: 2, accuracy: 10 } } as GeolocationPosition)
    })
    setGeolocation({ getCurrentPosition })
    renderHook(() => useDiscoveryLocation(true))

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled())
    const options = getCurrentPosition.mock.calls[0][2]
    expect(options.enableHighAccuracy).toBe(false)
    expect(typeof options.maximumAge).toBe('number')
    expect(options.maximumAge).toBeGreaterThan(0)
  })
})
