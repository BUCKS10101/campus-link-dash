import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Live delivery-location tracking - see
 * supabase/migrations/20260826140000_campus_routing_and_live_location.sql
 * and PHASE3_3A_ARCHITECTURE_REVISION.md §3/§6.
 *
 * Ephemeral by design: positions are sent over a Supabase Realtime
 * Broadcast channel (`order-location-{orderId}`), never written to any
 * table - there is no location-history data to retain or delete. Access
 * is enforced by RLS on realtime.messages (requester reads, deliverer
 * writes, only while the order is picked_up/out_for_delivery) - this
 * hook's own state checks are a UX convenience, not the security boundary.
 */

const TOPIC = (orderId: string) => `order-location-${orderId}`
/** Minimum time between publishes - battery/bandwidth throttling, not a
 *  continuous max-frequency GPS stream. */
const PUBLISH_INTERVAL_MS = 8000
/** A position older than this is shown as stale rather than as current. */
const STALE_AFTER_MS = 30000

export interface LiveLocation {
  lat: number
  lng: number
  updatedAt: number
}

/**
 * Deliverer side: only starts sending once `enabled` is true (an explicit,
 * separate consent action in the UI - this hook never starts tracking on
 * its own just because it's mounted). Stops and tears down watchPosition
 * and the channel the moment `enabled` goes false, orderId changes, or the
 * component unmounts.
 */
export function usePublishDeliveryLocation(orderId: string | null, enabled: boolean) {
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastSentRef = useRef(0)

  useEffect(() => {
    if (!orderId || !enabled) return
    if (!('geolocation' in navigator)) {
      setError('Location is not available on this device.')
      return
    }

    setError(null)
    const channel = supabase.channel(TOPIC(orderId), { config: { private: true } })
    channelRef.current = channel
    channel.subscribe()

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now()
        if (now - lastSentRef.current < PUBLISH_INTERVAL_MS) return
        lastSentRef.current = now
        channel.send({
          type: 'broadcast',
          event: 'location',
          payload: { lat: position.coords.latitude, lng: position.coords.longitude, updatedAt: now },
        })
      },
      () => setError('Could not read your location. Check location permissions.'),
      { enableHighAccuracy: false, maximumAge: PUBLISH_INTERVAL_MS },
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [orderId, enabled])

  return { error }
}

/**
 * Requester side: subscribes only while `enabled` (the order is actually
 * in an active-delivery state - callers should pass this from the order's
 * own status, not leave it always-on). `location` is null until the first
 * broadcast arrives, and `stale` flips true once a received position is
 * older than STALE_AFTER_MS - callers should show "location unavailable"
 * rather than a frozen, misleadingly-current dot in that case.
 */
export function useDeliveryLocation(orderId: string | null, enabled: boolean) {
  const [location, setLocation] = useState<LiveLocation | null>(null)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    if (!orderId || !enabled) {
      setLocation(null)
      setStale(false)
      return
    }

    const channel = supabase.channel(TOPIC(orderId), { config: { private: true } })
    channel
      .on('broadcast', { event: 'location' }, ({ payload }) => {
        setLocation(payload as LiveLocation)
        setStale(false)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orderId, enabled])

  useEffect(() => {
    if (!location) return
    const timer = window.setInterval(() => {
      setStale(Date.now() - location.updatedAt > STALE_AFTER_MS)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [location])

  return { location: stale ? null : location, stale }
}
