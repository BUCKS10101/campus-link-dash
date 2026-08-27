import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CancelOrderDialog } from '@/components/orders/CancelOrderDialog'
import { getErrorMessage, cn } from '@/lib/utils'
import { formatOrderItems, formatDeliveryLocation, formatRouteEstimate } from '@/lib/orderContent'
import { Text, Rule, StatusBadge } from '@/components/primitives'
import { ChatThread } from '@/components/chat/ChatThread'
import { useToast } from '@/hooks/use-toast'
import { createTimeline, DURATION, EASE } from '@/lib/motion/gsap'
import { useCampusPoints } from '@/hooks/useCampusPoints'
import { usePublishDeliveryLocation, useDeliveryLocation } from '@/hooks/useDeliveryLocation'
import type { WalkingRoute } from '@/hooks/useOrders'
import { NEXT_DELIVERER_ACTION } from '@/lib/orderStatus'
import type { OrderWithProfiles, Order } from '@/lib/database-types'

/**
 * Extracted from the pre-restructure MyOrders.tsx (3G) verbatim - every
 * active-order interaction (timeline, OTP, live tracking, chat,
 * cancellation) is unchanged behavior, just relocated so both the
 * Ordering and Delivering pages can each render their own single-role
 * active list instead of two lanes on one shared page. See
 * PHASE3_ACTIVITY_RESTRUCTURE (Ordering/Delivering split).
 */

const STATUS_SEQUENCE: Order['status'][] = ['pending', 'accepted', 'picked_up', 'out_for_delivery', 'delivered']

const REQUESTER_CANCELLABLE: Order['status'][] = ['pending', 'accepted']
// Once picked_up, the deliverer already has the item in hand - normal
// cancellation is no longer offered to them (see
// PHASE3_3G_DELIVERY_LIFECYCLE_SPEC.md's corrected matrix).
const DELIVERER_CANCELLABLE: Order['status'][] = ['accepted']

/** A five-node rule showing the real DB state machine. Ordered, not
 * timestamped — orders has no per-state timestamp columns. */
const OrderTimeline = ({ status }: { status: Order['status'] }) => {
  if (status === 'cancelled') {
    return <StatusBadge status="cancelled" />
  }
  const currentIndex = STATUS_SEQUENCE.indexOf(status)
  return (
    <div className="flex items-center gap-1" aria-label={`Order status: ${status.replace(/_/g, ' ')}`}>
      {STATUS_SEQUENCE.map((step, i) => (
        <React.Fragment key={step}>
          {i > 0 && (
            <div
              className={cn('h-px flex-1 transition-colors duration-slow ease-emphasized', i <= currentIndex ? 'bg-primary-deep' : 'bg-border')}
              aria-hidden="true"
            />
          )}
          <div
            className={cn(
              'size-2 rounded-full transition-colors duration-slow ease-emphasized',
              i < currentIndex ? 'bg-primary-deep' : i === currentIndex ? 'bg-primary-deep ring-2 ring-primary-deep/25 animate-dot-settle' : 'bg-border',
            )}
            aria-hidden="true"
          />
        </React.Fragment>
      ))}
    </div>
  )
}

/**
 * The token — the physical-slip metaphor made literal. Requester sees the
 * filled slip; deliverer sees the same shape, empty, waiting for input.
 */
const OtpPanel = ({
  order,
  isCustomer,
  isDeliverer,
  getMyOrderOtp,
  verifyDeliveryOtp,
  onVerified,
}: {
  order: OrderWithProfiles
  isCustomer: boolean
  isDeliverer: boolean
  getMyOrderOtp: (orderId: string) => Promise<string>
  verifyDeliveryOtp: (orderId: string, code: string) => Promise<boolean>
  onVerified: () => void
}) => {
  const { toast } = useToast()
  const [otp, setOtp] = useState<string | null>(null)
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError] = useState<string | null>(null)
  const [inputCode, setInputCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [wrongShake, setWrongShake] = useState(false)
  const [justDelivered, setJustDelivered] = useState(false)
  const slipRef = useRef<HTMLDivElement>(null)
  const deliveredRef = useRef<HTMLDivElement>(null)

  const otpEligible = order.status === 'picked_up' || order.status === 'out_for_delivery'

  useEffect(() => {
    if (!isCustomer || !otpEligible) return
    let cancelled = false
    setOtpLoading(true)
    setOtpError(null)
    getMyOrderOtp(order.id)
      .then((code) => { if (!cancelled) setOtp(code) })
      .catch((err) => { if (!cancelled) setOtpError(getErrorMessage(err, 'Failed to load code')) })
      .finally(() => { if (!cancelled) setOtpLoading(false) })
    return () => { cancelled = true }
  }, [isCustomer, otpEligible, order.id, order.status])

  useEffect(() => {
    if (!otp || !slipRef.current) return
    const digits = slipRef.current.querySelectorAll<HTMLElement>('[data-otp-digit]')
    const { tl, dur } = createTimeline()
    tl.fromTo(slipRef.current, { opacity: 0, scaleY: 0.88 }, { opacity: 1, scaleY: 1, duration: dur(DURATION.base), ease: EASE.out })
      .fromTo(
        digits,
        { opacity: 0, y: 6 },
        { opacity: 1, y: 0, duration: dur(DURATION.fast), ease: EASE.out, stagger: dur(DURATION.instant / 2) },
        `-=${dur(0.05)}`,
      )
    return () => { tl.kill() }
  }, [otp])

  useEffect(() => {
    if (!justDelivered || !deliveredRef.current) return
    const rule = deliveredRef.current.querySelector<HTMLElement>('[data-delivered-rule]')
    const label = deliveredRef.current.querySelector<HTMLElement>('[data-delivered-label]')
    const { tl, dur } = createTimeline()
    if (rule) tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: dur(DURATION.slow), ease: EASE.emphasized, transformOrigin: 'left' })
    if (label) tl.fromTo(label, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: dur(DURATION.base), ease: EASE.out }, `-=${dur(0.15)}`)
    tl.call(() => onVerified())
    return () => { tl.kill() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justDelivered])

  if (!otpEligible) return null

  if (isCustomer) {
    return (
      <div className="mt-5 border-t-2 border-foreground pt-5">
        <Text variant="label" tone="faint" as="div">Show this to your deliverer</Text>
        {otpLoading && <Text variant="bodySm" tone="muted" as="p" className="mt-3">Fetching your code…</Text>}
        {otpError && (
          <Alert variant="destructive" className="mt-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{otpError}</AlertDescription>
          </Alert>
        )}
        {!otpLoading && !otpError && otp && (
          <div ref={slipRef} className="mt-3 bg-primary-deep px-6 py-6 text-center" role="status" aria-live="polite">
            <Text variant="dataLg" tone="inherit" className="text-primary-foreground">
              {otp.split('').map((digit, i) => (
                <span key={i} data-otp-digit className="inline-block">
                  {digit}{i < otp.length - 1 ? ' ' : ''}
                </span>
              ))}
            </Text>
          </div>
        )}
        <Text variant="caption" tone="faint" as="p" className="mt-2">They'll type this in to confirm.</Text>
      </div>
    )
  }

  if (isDeliverer) {
    if (justDelivered) {
      return (
        <div ref={deliveredRef} className="mt-5 border-t-2 border-foreground pt-5">
          <div data-delivered-rule className="h-[2px] w-full bg-primary-deep" />
          <div data-delivered-label className="mt-4">
            <Text variant="label" tone="signalDeep" as="div">Delivered</Text>
            <Text variant="bodySm" tone="muted" as="p" className="mt-1">Confirmed — nice work.</Text>
          </div>
        </div>
      )
    }

    const handleVerify = async () => {
      setVerifying(true)
      setVerifyError(null)
      try {
        const success = await verifyDeliveryOtp(order.id, inputCode)
        if (success) {
          toast({ title: 'Delivered', description: 'Confirmed — nice work.' })
          setInputCode('')
          setJustDelivered(true)
        } else {
          setVerifyError('Incorrect code. Ask them to confirm and try again.')
          setWrongShake(true)
          setTimeout(() => setWrongShake(false), 400)
        }
      } catch (err) {
        setVerifyError(getErrorMessage(err, 'Verification failed'))
      } finally {
        setVerifying(false)
      }
    }

    return (
      <div className="mt-5 border-t-2 border-foreground pt-5">
        <Text variant="label" tone="faint" as="div">Enter their code to confirm</Text>
        <div
          className={cn(
            'mt-3 border-2 border-dashed border-border-strong px-6 py-6 text-center transition-transform',
            wrongShake && 'animate-[shake_0.4s]',
          )}
        >
          <Input
            inputMode="numeric"
            maxLength={6}
            placeholder="0 0 0 0 0 0"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ''))}
            aria-label="Delivery code"
            className="border-0 bg-transparent text-center font-data text-data-lg tabular-nums tracking-[0.2em] shadow-none focus-visible:ring-0"
          />
        </div>
        {verifyError && (
          <Alert variant="destructive" className="mt-3" role="alert">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{verifyError}</AlertDescription>
          </Alert>
        )}
        <Button
          onClick={handleVerify}
          loading={verifying}
          disabled={inputCode.length !== 6}
          className="mt-3 w-full"
        >
          Confirm delivery
        </Button>
      </div>
    )
  }

  return null
}

/**
 * Real walking route + optional live location - see
 * supabase/migrations/20260826140000_campus_routing_and_live_location.sql
 * and PHASE3_3A_ARCHITECTURE_REVISION.md. Only rendered while the
 * expanded order's detail is mounted, and only does anything at all once
 * the order is picked_up/out_for_delivery AND both ends resolved to a
 * seeded campus_points row at creation time.
 */
const CampusMap = React.lazy(() => import('@/components/map/CampusMap'))

const DeliveryTrackingSection = ({
  order,
  isDeliverer,
  computeWalkingRoute,
  computeWalkingRouteCustom,
}: {
  order: OrderWithProfiles
  isDeliverer: boolean
  computeWalkingRoute: (pickupPointId: string, deliveryPointId: string) => Promise<WalkingRoute | null>
  computeWalkingRouteCustom: (pickupPointId: string, lat: number, lng: number) => Promise<WalkingRoute | null>
}) => {
  const { points } = useCampusPoints()
  const [route, setRoute] = useState<WalkingRoute | null>(null)
  const [sharing, setSharing] = useState(false)

  const trackingEligible = order.status === 'picked_up' || order.status === 'out_for_delivery'
  const pickupPoint = order.pickup_point_id ? points.find((p) => p.id === order.pickup_point_id) : undefined
  const deliveryPoint = order.delivery_point_id ? points.find((p) => p.id === order.delivery_point_id) : undefined
  const hasCustomDelivery = order.custom_delivery_lat != null && order.custom_delivery_lng != null
  const routable = trackingEligible && !!pickupPoint && (!!deliveryPoint || hasCustomDelivery)

  useEffect(() => {
    if (!routable || !pickupPoint) {
      setRoute(null)
      return
    }
    let cancelled = false
    const request = deliveryPoint
      ? computeWalkingRoute(pickupPoint.id, deliveryPoint.id)
      : computeWalkingRouteCustom(pickupPoint.id, order.custom_delivery_lat!, order.custom_delivery_lng!)
    request.then((r) => {
      if (!cancelled) setRoute(r)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routable, pickupPoint?.id, deliveryPoint?.id, order.custom_delivery_lat, order.custom_delivery_lng])

  const { error: shareError } = usePublishDeliveryLocation(isDeliverer ? order.id : null, isDeliverer && sharing)
  const { location: liveLocation, stale } = useDeliveryLocation(!isDeliverer ? order.id : null, !isDeliverer && trackingEligible)

  if (!routable) return null

  return (
    <div className="mt-5 border-t-2 border-foreground pt-5">
      <Text variant="label" tone="faint" as="div">Route</Text>

      {isDeliverer && (
        <label className="mt-3 flex items-center gap-2 font-body text-body-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={sharing}
            onChange={(e) => setSharing(e.target.checked)}
            className="size-4"
          />
          Share my live location for this delivery
        </label>
      )}
      {isDeliverer && shareError && (
        <Text variant="caption" tone="danger" as="p" className="mt-1">{shareError}</Text>
      )}
      {!isDeliverer && !liveLocation && (
        <Text variant="caption" tone="faint" as="p" className="mt-2">
          {stale ? 'Their last known location is out of date.' : 'Waiting for their live location…'}
        </Text>
      )}

      {!isDeliverer && hasCustomDelivery && order.custom_delivery_note && (
        <Text variant="bodySm" tone="muted" as="p" className="mt-2">
          &ldquo;{order.custom_delivery_note}&rdquo;
        </Text>
      )}

      <React.Suspense fallback={<div className="mt-3 h-56 w-full bg-surface-sunken" aria-hidden="true" />}>
        <CampusMap
          className="mt-3 h-56 w-full"
          pickup={{ lat: pickupPoint!.lat, lng: pickupPoint!.lng, label: pickupPoint!.label }}
          delivery={
            deliveryPoint
              ? { lat: deliveryPoint.lat, lng: deliveryPoint.lng, label: deliveryPoint.label }
              : { lat: order.custom_delivery_lat!, lng: order.custom_delivery_lng!, label: 'Custom pin' }
          }
          route={route?.geometry ?? null}
          liveLocation={liveLocation}
        />
      </React.Suspense>

      {route && (
        <Text variant="caption" tone="faint" as="p" className="mt-2">
          {formatRouteEstimate(route, 2)}
        </Text>
      )}
    </div>
  )
}

interface DetailProps {
  currentUserId: string
  getMyOrderOtp: (orderId: string) => Promise<string>
  verifyDeliveryOtp: (orderId: string, code: string) => Promise<boolean>
  computeWalkingRoute: (pickupPointId: string, deliveryPointId: string) => Promise<WalkingRoute | null>
  computeWalkingRouteCustom: (pickupPointId: string, lat: number, lng: number) => Promise<WalkingRoute | null>
  onAdvance: (order: OrderWithProfiles) => void
  onVerified: () => void
  onCancel: (order: OrderWithProfiles, role: 'requester' | 'deliverer') => Promise<void>
}

const ActiveOrderDetail = ({
  order,
  role,
  currentUserId,
  getMyOrderOtp,
  verifyDeliveryOtp,
  computeWalkingRoute,
  computeWalkingRouteCustom,
  onAdvance,
  onVerified,
  onCancel,
}: { order: OrderWithProfiles; role: 'requester' | 'deliverer' } & DetailProps) => {
  const isCustomer = role === 'requester'
  const isDeliverer = role === 'deliverer'
  const counterpart = isCustomer ? order.deliverer_profile : order.requester_profile
  const nextAction = isDeliverer ? NEXT_DELIVERER_ACTION[order.status] : undefined
  const canCancel = isCustomer
    ? REQUESTER_CANCELLABLE.includes(order.status)
    : DELIVERER_CANCELLABLE.includes(order.status)

  return (
    <div className="animate-rise-in pb-6 pt-1">
      <div className="mt-4">
        <OrderTimeline status={order.status} />
      </div>

      {counterpart && (
        <Text variant="bodySm" tone="muted" as="p" className="mt-3">
          {isCustomer ? 'Carried by' : 'Requested by'} <span className="font-semibold text-foreground">{counterpart.name || 'Unknown'}</span>
          {counterpart.phone ? ` · ${counterpart.phone}` : ''}
        </Text>
      )}
      {isCustomer && !order.deliverer_id && (
        <Text variant="bodySm" tone="muted" as="p" className="mt-3">Waiting for someone to take it.</Text>
      )}

      {isDeliverer && nextAction && (
        <Button onClick={() => onAdvance(order)} className="mt-4 w-full sm:w-auto">
          {nextAction.label}
        </Button>
      )}

      {canCancel && (
        <div className="mt-4">
          <CancelOrderDialog
            role={role}
            hasDeliverer={!!order.deliverer_id}
            onConfirm={() => onCancel(order, role)}
          />
        </div>
      )}

      <OtpPanel
        order={order}
        isCustomer={isCustomer}
        isDeliverer={isDeliverer}
        getMyOrderOtp={getMyOrderOtp}
        verifyDeliveryOtp={verifyDeliveryOtp}
        onVerified={onVerified}
      />

      <DeliveryTrackingSection order={order} isDeliverer={isDeliverer} computeWalkingRoute={computeWalkingRoute} computeWalkingRouteCustom={computeWalkingRouteCustom} />

      <ChatThread
        orderId={order.id}
        currentUserId={currentUserId}
        counterpartName={counterpart?.name || null}
        contextLine={`${order.restaurant_name} → ${formatDeliveryLocation(order.delivery_location)}`}
      />
    </div>
  )
}

/** One active order's summary row - the header of its entry, always
 * shown. Expands into ActiveOrderDetail when this is the open one, or
 * always when it's the only active order. */
const ActiveOrderRow = ({
  order,
  role,
  expanded,
  onToggle,
  ...detailProps
}: {
  order: OrderWithProfiles
  role: 'requester' | 'deliverer'
  expanded: boolean
  onToggle: () => void
} & DetailProps) => {
  const isCustomer = role === 'requester'

  return (
    <div className={expanded ? 'py-6' : 'py-4'}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          'flex w-full items-start justify-between gap-4 text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
      >
        <div className="min-w-0">
          <Text variant={expanded ? 'h3' : 'body'} className={cn('block', expanded ? '' : 'font-semibold')}>
            {formatOrderItems(order.items)}
          </Text>
          <Text variant="bodySm" tone="muted" className="mt-0.5 block">
            {order.restaurant_name} → {formatDeliveryLocation(order.delivery_location)}
          </Text>
          {isCustomer && (
            expanded ? (
              <Text variant="data" tone="signalDeep" as="p" className="mt-2 block tabular-nums">₹{order.tip_amount}</Text>
            ) : (
              <Text variant="caption" tone="signalDeep" as="p" className="mt-1 font-semibold">₹{order.tip_amount} tip</Text>
            )
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={order.status} />
          <ChevronDown
            className={cn('size-4 text-muted-foreground transition-transform duration-fast ease-out', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </div>
      </button>

      {expanded && <ActiveOrderDetail order={order} role={role} {...detailProps} />}
    </div>
  )
}

export interface ActiveOrdersSectionProps extends DetailProps {
  title: string
  role: 'requester' | 'deliverer'
  orders: OrderWithProfiles[]
  expandedId: string | null
  onToggle: (id: string) => void
  emptyMessage: string
  emptyCtaLabel: string
  emptyCtaHref: string
}

/**
 * The single-role active-orders list for either the Ordering or
 * Delivering page - was "Lane" in the pre-restructure two-column
 * MyOrders.tsx; each page now renders exactly one of these, not two
 * side by side.
 */
export function ActiveOrdersSection({
  title,
  role,
  orders,
  expandedId,
  onToggle,
  emptyMessage,
  emptyCtaLabel,
  emptyCtaHref,
  ...detailProps
}: ActiveOrdersSectionProps) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 border-b-2 border-foreground pb-4">
        <Text variant="h2" as="h2">{title}</Text>
        {orders.length > 0 && (
          <Text variant="data" tone="faint" as="div" className="tabular-nums">{orders.length}</Text>
        )}
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-6">
          <Text variant="bodySm" tone="faint">{emptyMessage}</Text>
          <Link
            to={emptyCtaHref}
            className="font-body text-body-sm font-semibold text-primary-deep underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {emptyCtaLabel}
          </Link>
        </div>
      ) : (
        <div>
          {orders.map((order, i) => {
            const expanded = expandedId === null ? i === 0 : expandedId === order.id
            return (
              <React.Fragment key={order.id}>
                {i > 0 && <Rule />}
                <ActiveOrderRow
                  order={order}
                  role={role}
                  expanded={expanded}
                  onToggle={() => onToggle(order.id)}
                  {...detailProps}
                />
              </React.Fragment>
            )
          })}
        </div>
      )}
    </section>
  )
}
