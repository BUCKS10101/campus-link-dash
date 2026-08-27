import { useEffect, useState } from 'react'

/**
 * Phase 3H, Discovery Mode A - see
 * PHASE3_3H_PREFERENCES_PERSONALIZATION_SPEC.md §3.1/§3.3/§3.4. A single
 * one-shot `getCurrentPosition()` read per mount/enable, never
 * `watchPosition`, never persisted, never sent to the server. Completely
 * separate from 3A's live-*delivery*-location tracking
 * (usePublishDeliveryLocation/useDeliveryLocation in useDeliveryLocation.ts)
 * - that one is a Realtime Broadcast channel between two specific
 * participants on an active order; this one is a single, private,
 * in-memory read used only to filter the viewer's own Home board.
 */

export type DiscoveryLocationState =
  | { status: 'idle' }
  | { status: 'unsupported' }
  | { status: 'requesting' }
  | { status: 'granted'; lat: number; lng: number; accuracyMeters: number }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'timeout' }

/** Browsers cache a recent fix for this long before re-acquiring hardware
 * - a battery/UX optimization already built into the Geolocation API
 * itself, not additional tracking. Comfortably short of anything that
 * could be called "continuous." */
const MAX_POSITION_AGE_MS = 60_000
const REQUEST_TIMEOUT_MS = 8_000

export function useDiscoveryLocation(enabled: boolean): DiscoveryLocationState {
  const [state, setState] = useState<DiscoveryLocationState>({ status: 'idle' })

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' })
      return
    }

    if (!navigator.geolocation) {
      setState({ status: 'unsupported' })
      return
    }

    let cancelled = false
    setState({ status: 'requesting' })

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return
        setState({
          status: 'granted',
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        })
      },
      (error) => {
        if (cancelled) return
        if (error.code === error.PERMISSION_DENIED) setState({ status: 'denied' })
        else if (error.code === error.TIMEOUT) setState({ status: 'timeout' })
        else setState({ status: 'unavailable' })
      },
      { enableHighAccuracy: false, timeout: REQUEST_TIMEOUT_MS, maximumAge: MAX_POSITION_AGE_MS },
    )

    return () => { cancelled = true }
  }, [enabled])

  return state
}
