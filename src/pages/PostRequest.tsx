import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/useAuth'
import { useOrders } from '@/hooks/useOrders'
import { useCampusPoints, CAMPUS_POINT_CATEGORIES } from '@/hooks/useCampusPoints'
import { getErrorMessage, cn } from '@/lib/utils'
import { parseOrderItemsInput, formatRouteEstimate } from '@/lib/orderContent'
import type { DeliveryLocation } from '@/lib/orderContent'
import type { CampusPointKind } from '@/lib/database-types'
import { Text, Rule } from '@/components/primitives'
import { createTimeline, DURATION, EASE } from '@/lib/motion/gsap'

const CampusMap = React.lazy(() => import('@/components/map/CampusMap'))

// Restaurant display names match their campus_points.label - see
// PHASE3_3A_LOCATION_SPEC.md §13 (Campus Store -> Balaji Store alias; the
// stable key stays 'campus-store').
const RESTAURANTS = [
  { id: 'one-food', name: 'One Food World' },
  { id: 'dc-cafe', name: 'DC Cafe' },
  { id: 'campus-store', name: 'Balaji Store' },
]

const TIP_PRESETS = [20, 30, 50, 75, 100]

// Men's Hostel and Ladies Hostel blocks sharing a letter (e.g. "A") are
// REAL, physically distinct locations with their own campus_points row
// and coordinates - CampusPoint.wing is the geographic source of truth
// here, not a display convenience. See PHASE3_3A_LOCATION_SPEC.md's
// Accommodation correction. "Annex / Other" covers both genuinely
// wingless points (MGB, the Annexes) and any accommodation point whose
// wing hasn't been confirmed yet (wing: null either way) - never guessed.

const STEP_META = [
  { title: 'What', subtitle: "What are you asking someone to pick up?" },
  { title: 'Where', subtitle: "Where's it going?" },
  { title: 'Offer', subtitle: "What are you offering the person who brings it?" },
  { title: 'Review', subtitle: 'One more look before it goes on the board.' },
] as const

const OptionRow = ({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={cn(
      'flex w-full items-center justify-between py-3 text-left font-body text-body transition-colors duration-fast ease-out',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      selected ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
    )}
  >
    <span>{children}</span>
    {selected && <span className="font-data text-caption uppercase tracking-[0.1em] text-primary-deep">Selected</span>}
  </button>
)

const ToggleButton = ({ selected, onClick, children, className }: { selected: boolean; onClick: () => void; children: React.ReactNode; className?: string }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={cn(
      'rounded-full border px-4 py-2.5 font-body text-body-sm font-semibold transition-colors duration-fast ease-out',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      selected ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground',
      className,
    )}
  >
    {children}
  </button>
)

const initialFormData = {
  restaurant: '',
  orderDescription: '',
  // 'catalog': locationPointId names a campus_points row. 'custom': a
  // dropped pin, customLat/Lng/Note. See PHASE3_3A_LOCATION_SPEC.md §14/§16.
  locationMode: '' as '' | 'catalog' | 'custom',
  locationCategory: '' as '' | CampusPointKind,
  // Accommodation-only filter - a real geographic distinction (CampusPoint.wing), not cosmetic.
  accommodationWing: '' as '' | 'mens' | 'ladies' | 'other',
  locationPointId: '',
  customLat: null as number | null,
  customLng: null as number | null,
  customNote: '',
  tip: [30] as number[],
}

const PostRequest = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const { createOrder, computeWalkingRoute, computeWalkingRouteCustom } = useOrders()
  const { byKey: byCampusPointKey, byCategory, byWing, points: campusPoints } = useCampusPoints()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [attemptedAdvance, setAttemptedAdvance] = useState(false)
  const [posted, setPosted] = useState<{ tip: number; items: string; restaurant: string; location: string } | null>(null)
  const [formData, setFormData] = useState(initialFormData)
  const topRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLDivElement>(null)

  // Real, server-computed walking-route distance - null until BOTH the
  // pickup and delivery selection resolve to a campus_points row with a
  // seeded coordinate (most don't yet - see
  // PHASE3_3A_ARCHITECTURE_PROPOSAL.md). Never fabricated: no distance/
  // reward-suggestion line renders at all while this is null, rather than
  // showing a fake number. compute_walking_route() itself falls back to
  // straight-line distance when a real route can't be found (sparse graph
  // coverage) - this is still the real distance either way, just possibly
  // not path-following; see PHASE3_3A_ARCHITECTURE_REVISION.md.
  const pickupPoint = formData.restaurant ? byCampusPointKey(formData.restaurant) : undefined
  const deliveryPoint = formData.locationMode === 'catalog' && formData.locationPointId
    ? campusPoints.find((p) => p.id === formData.locationPointId)
    : undefined
  const hasCustomPin = formData.locationMode === 'custom' && formData.customLat != null && formData.customLng != null
  const [resolvedRoute, setResolvedRoute] = useState<{ distanceKm: number; geometry: GeoJSON.LineString | null; etaMinutes: number } | null>(null)
  const resolvedDistance = resolvedRoute?.distanceKm ?? null

  useEffect(() => {
    if (!pickupPoint) {
      setResolvedRoute(null)
      return
    }
    let cancelled = false
    if (deliveryPoint) {
      computeWalkingRoute(pickupPoint.id, deliveryPoint.id).then((route) => {
        if (!cancelled) setResolvedRoute(route)
      })
    } else if (hasCustomPin) {
      computeWalkingRouteCustom(pickupPoint.id, formData.customLat!, formData.customLng!).then((route) => {
        if (!cancelled) setResolvedRoute(route)
      })
    } else {
      setResolvedRoute(null)
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupPoint?.id, deliveryPoint?.id, hasCustomPin, formData.customLat, formData.customLng])

  useEffect(() => {
    topRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [currentStep])

  // Signature moment: the request assembling into "now part of the board."
  // Headline settles first, the rule extends like the slip being drawn
  // taut, the tip resolves into place, then the rest of the detail and the
  // actions settle in - a short, coordinated sequence, not a hard cut to
  // the finished state.
  useEffect(() => {
    if (!posted || !successRef.current) return
    const el = successRef.current
    const headline = el.querySelector('[data-success-headline]')
    const body = el.querySelector('[data-success-body]')
    const rule = el.querySelector('[data-success-rule]')
    const tip = el.querySelector('[data-success-tip]')
    const details = el.querySelectorAll('[data-success-detail]')
    const actions = el.querySelector('[data-success-actions]')

    const { tl, dur } = createTimeline()
    tl.fromTo(headline, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: dur(DURATION.slow), ease: EASE.emphasized })
      .fromTo(body, { opacity: 0 }, { opacity: 1, duration: dur(DURATION.base), ease: EASE.out }, `-=${dur(0.15)}`)
      .fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: dur(DURATION.slow), ease: EASE.emphasized, transformOrigin: 'left' }, `-=${dur(0.05)}`)
      .fromTo(tip, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: dur(DURATION.base), ease: EASE.out }, `-=${dur(0.1)}`)
      .fromTo(details, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: dur(DURATION.fast), ease: EASE.out, stagger: dur(DURATION.instant) }, `-=${dur(0.05)}`)
      .fromTo(actions, { opacity: 0 }, { opacity: 1, duration: dur(DURATION.base), ease: EASE.out }, `-=${dur(0.05)}`)

    return () => { tl.kill() }
  }, [posted])

  const items = parseOrderItemsInput(formData.orderDescription)
  const selectedRestaurant = RESTAURANTS.find((r) => r.id === formData.restaurant)
  // Each accommodation point already carries its own correct label
  // (e.g. a Men's Hostel A row is labelled "Men's Hostel A" directly,
  // once its real coordinate is confirmed) - no client-side label
  // synthesis needed, since wing is real geographic identity on the
  // point itself, not a presentation layer over a shared block.
  const locationLabel = deliveryPoint?.label
    ?? (hasCustomPin ? (formData.customNote.trim() || 'Custom pin') : '')

  const getStepIssue = (step: number): string | null => {
    switch (step) {
      case 1:
        if (!formData.restaurant) return 'Select where you’re ordering from.'
        if (items.length === 0) return 'Add at least one item.'
        return null
      case 2:
        if (!formData.locationMode) return 'Pick a delivery location.'
        if (formData.locationMode === 'catalog' && formData.locationCategory === 'accommodation' && !formData.accommodationWing) return 'Pick Men’s, Ladies, or Annex / Other.'
        if (formData.locationMode === 'catalog' && !formData.locationPointId) return 'Pick a location from the list.'
        if (formData.locationMode === 'custom' && !hasCustomPin) return 'Drop a pin on the map.'
        return null
      default:
        return null
    }
  }

  const currentIssue = getStepIssue(currentStep)

  const resetForm = () => {
    setFormData(initialFormData)
    setCurrentStep(1)
    setAttemptedAdvance(false)
    setPosted(null)
  }

  const handleNext = () => {
    if (currentIssue) {
      setAttemptedAdvance(true)
      return
    }
    setAttemptedAdvance(false)
    setCurrentStep((s) => Math.min(4, s + 1))
  }

  const handleBack = () => {
    setAttemptedAdvance(false)
    setCurrentStep((s) => Math.max(1, s - 1))
  }

  const handleSubmit = async () => {
    if (loading) return

    if (!user?.user) {
      toast({ title: 'Not signed in', description: 'Please log in again before posting a request.', variant: 'destructive' })
      navigate('/login')
      return
    }

    // Phase 3J - see PHASE3_3J_TRUST_SAFETY_SPEC.md §2/§8. ProtectedRoute
    // already keeps an unverified user off this page entirely; this is a
    // defensive second layer (e.g. verification status changing mid-visit)
    // - the real, un-bypassable boundary is the server-side rate-limit
    // trigger on orders (createOrder() still gets validated there
    // regardless), this is just the UX courtesy on top of it.
    if (!user.emailVerified) {
      toast({
        title: 'Verify your email to do this',
        description: 'Resend a verification link from the check-your-email page.',
        variant: 'destructive',
      })
      navigate('/verify-email')
      return
    }

    setLoading(true)
    try {
      const restaurant = RESTAURANTS.find((r) => r.id === formData.restaurant)
      if (!restaurant) throw new Error('Please select a restaurant')

      // delivery_location (jsonb) stays populated for every order, catalog
      // or custom pin, for backward-compatible display everywhere that
      // already reads it - see PHASE3_3A_LOCATION_SPEC.md §16/§20. A
      // custom pin's exact coordinate lives only in the dedicated
      // custom_delivery_lat/lng columns below, never here.
      const deliveryLocation: DeliveryLocation = { type: 'campus', label: locationLabel }
      if (!deliveryLocation.label) throw new Error('Please select a delivery location')

      // Set once, here, alongside distance_km itself - compute_walking_route()'s
      // routed-vs-fallback distinction (geometry: null or not) only exists in
      // resolvedRoute's transient state; it can't be reliably reconstructed
      // later (graph connectivity can change), so it's captured now or not
      // at all. See PHASE3_3B_NEARBY_DISCOVERY_SPEC.md §5.
      const distanceSource: 'routed' | 'fallback' | 'unresolved' =
        resolvedRoute == null ? 'unresolved' : resolvedRoute.geometry ? 'routed' : 'fallback'

      await createOrder({
        requester_id: user.user.id,
        deliverer_id: null,
        restaurant_name: restaurant.name,
        items,
        tip_amount: formData.tip[0],
        delivery_location: deliveryLocation,
        distance_km: resolvedDistance,
        distance_source: distanceSource,
        pickup_point_id: pickupPoint?.id ?? null,
        delivery_point_id: deliveryPoint?.id ?? null,
        custom_delivery_lat: hasCustomPin ? formData.customLat : null,
        custom_delivery_lng: hasCustomPin ? formData.customLng : null,
        custom_delivery_note: hasCustomPin ? (formData.customNote.trim() || null) : null,
        status: 'pending',
      })

      setPosted({
        tip: formData.tip[0],
        items: items.join(', '),
        restaurant: restaurant.name,
        location: deliveryLocation.label,
      })
    } catch (error) {
      toast({ title: "Couldn't post it", description: getErrorMessage(error, 'Please try again.'), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  // The one recurring color field in this flow - the posting slip stays a
  // forest block from the first keystroke through Review, so the object
  // being assembled has a consistent, recognizable identity throughout,
  // not just at the end.
  const PostingPreview = ({ dense = false }: { dense?: boolean }) => (
    <div className={cn('bg-foreground text-background', dense ? 'px-6 py-6' : 'px-7 py-8 md:sticky md:top-24')}>
      <Text variant="label" tone="inherit" className="opacity-60">Preview</Text>
      <Text variant="dataLg" tone="inherit" className="mt-3 block tabular-nums">
        ₹{formData.tip[0]}
      </Text>
      <Text variant="h2" as="p" tone="inherit" className="mt-2 block">
        {items.length > 0 ? items.join(', ') : <span className="opacity-60">What are you ordering?</span>}
      </Text>
      <Text variant="bodySm" tone="inherit" className="mt-2 block opacity-80">
        {selectedRestaurant?.name ?? <span className="opacity-60">Pick a place</span>}
        {' → '}
        {locationLabel || <span className="opacity-60">Where&rsquo;s it going?</span>}
      </Text>
      {resolvedDistance != null && (
        <>
          <Text variant="caption" tone="inherit" className="mt-1 block opacity-60">
            {formatRouteEstimate(resolvedRoute!)}
          </Text>
          {pickupPoint && (deliveryPoint || hasCustomPin) && (
            <React.Suspense fallback={null}>
              <CampusMap
                className="mt-3 h-40 w-full"
                pickup={{ lat: pickupPoint.lat, lng: pickupPoint.lng, label: pickupPoint.label }}
                delivery={
                  deliveryPoint
                    ? { lat: deliveryPoint.lat, lng: deliveryPoint.lng, label: deliveryPoint.label }
                    : { lat: formData.customLat!, lng: formData.customLng!, label: 'Custom pin' }
                }
                route={resolvedRoute!.geometry}
              />
            </React.Suspense>
          )}
        </>
      )}
    </div>
  )

  if (posted) {
    return (
      <div className="max-w-measure" ref={successRef}>
        <Text variant="label" tone="faint" as="div">Posted</Text>
        <Text data-success-headline variant="display" accent className="mt-4 block">It&rsquo;s on the board.</Text>
        <Text data-success-body variant="body" tone="muted" className="mt-3 block max-w-[42ch]">
          Someone nearby will see this right away. Once they take it, you&rsquo;ll get a delivery
          code to hand over when they show up.
        </Text>

        <div data-success-rule className="mt-8 h-[2px] w-full origin-left bg-foreground" />

        <div className="mt-6 bg-foreground px-7 py-8 text-background">
          <Text data-success-detail variant="label" tone="inherit" as="div" className="opacity-60">What you posted</Text>
          <Text data-success-tip variant="dataLg" tone="inherit" className="mt-3 block origin-left tabular-nums">₹{posted.tip}</Text>
          <Text data-success-detail variant="h2" as="p" tone="inherit" className="mt-2 block">{posted.items}</Text>
          <Text data-success-detail variant="bodySm" tone="inherit" className="mt-2 block opacity-80">{posted.restaurant} → {posted.location}</Text>
        </div>

        <div data-success-actions className="mt-8 flex flex-wrap items-center gap-6">
          <Button onClick={() => navigate('/activity/ordering')}>View on Activity</Button>
          <button
            type="button"
            onClick={resetForm}
            className="font-body text-body-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Post another request
          </button>
        </div>
      </div>
    )
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div>
            <div className="flex flex-wrap gap-2">
              {RESTAURANTS.map((r) => (
                <ToggleButton key={r.id} selected={formData.restaurant === r.id} onClick={() => setFormData({ ...formData, restaurant: r.id })}>
                  {r.name}
                </ToggleButton>
              ))}
            </div>

            <Text as="label" variant="label" tone="faint" htmlFor="items" className="mb-2 mt-7 block">Items</Text>
            <Textarea
              id="items"
              placeholder={'2x Chicken Burger\n1x Large Fries\n2x Coke'}
              value={formData.orderDescription}
              onChange={(e) => setFormData({ ...formData, orderDescription: e.target.value })}
              className="min-h-32 font-body"
              maxLength={500}
              aria-describedby="items-hint"
            />
            <div className="mt-2 flex items-center justify-between">
              <Text id="items-hint" variant="caption" tone="faint">One item per line — be specific about quantities.</Text>
              <Text variant="caption" tone="faint" className="shrink-0 tabular-nums">{formData.orderDescription.length}/500</Text>
            </div>
          </div>
        )

      case 2:
        return (
          <div>
            <div className="flex flex-wrap gap-2">
              {CAMPUS_POINT_CATEGORIES.map((c) => (
                <ToggleButton
                  key={c.kind}
                  selected={formData.locationMode === 'catalog' && formData.locationCategory === c.kind}
                  onClick={() => setFormData({ ...formData, locationMode: 'catalog', locationCategory: c.kind, accommodationWing: '', locationPointId: '' })}
                >
                  {c.label}
                </ToggleButton>
              ))}
              <ToggleButton
                selected={formData.locationMode === 'custom'}
                onClick={() => setFormData({ ...formData, locationMode: 'custom', locationCategory: '', accommodationWing: '', locationPointId: '' })}
              >
                📍 Drop a pin
              </ToggleButton>
            </div>

            {formData.locationMode === 'catalog' && formData.locationCategory === 'accommodation' && (
              <div className="mt-5">
                <div className="flex gap-2">
                  {([
                    ['mens', "Men's Hostel"],
                    ['ladies', 'Ladies Hostel'],
                    ['other', 'Annex / Other'],
                  ] as const).map(([wing, label]) => (
                    <ToggleButton
                      key={wing}
                      selected={formData.accommodationWing === wing}
                      onClick={() => setFormData({ ...formData, accommodationWing: wing, locationPointId: '' })}
                      className="flex-1 text-center"
                    >
                      {label}
                    </ToggleButton>
                  ))}
                </div>
                {/* Men's/Ladies show the same full block list - there's no
                    reliable per-letter gender source, so the wing only
                    changes the label prefix applied on submit, not which
                    blocks are offered. Annex/Other is the one real split:
                    MGB and the Annexes are never lettered blocks. */}
                {formData.accommodationWing && (() => {
                  const wingPoints = byWing(formData.accommodationWing === 'other' ? null : formData.accommodationWing)
                  return (
                    <div className="mt-4">
                      {wingPoints.length === 0 && <Text variant="bodySm" tone="faint">Nothing here yet.</Text>}
                      {wingPoints.map((point, i) => (
                        <React.Fragment key={point.id}>
                          {i > 0 && <Rule />}
                          <OptionRow
                            selected={formData.locationPointId === point.id}
                            onClick={() => setFormData({ ...formData, locationPointId: point.id })}
                          >
                            {point.label}
                          </OptionRow>
                        </React.Fragment>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}

            {formData.locationMode === 'catalog' && formData.locationCategory && formData.locationCategory !== 'accommodation' && (
              <div className="mt-5">
                {byCategory(formData.locationCategory).length === 0 && (
                  <Text variant="bodySm" tone="faint">Nothing in this category yet.</Text>
                )}
                {byCategory(formData.locationCategory).map((point, i) => (
                  <React.Fragment key={point.id}>
                    {i > 0 && <Rule />}
                    <OptionRow
                      selected={formData.locationPointId === point.id}
                      onClick={() => setFormData({ ...formData, locationPointId: point.id })}
                    >
                      {point.label}
                    </OptionRow>
                  </React.Fragment>
                ))}
              </div>
            )}

            {formData.locationMode === 'custom' && (
              <div className="mt-5">
                <Text variant="label" tone="faint" as="div" className="mb-2">Tap the map to drop a pin</Text>
                <React.Suspense fallback={<div className="h-64 w-full bg-surface-sunken" aria-hidden="true" />}>
                  <CampusMap
                    className="h-64 w-full"
                    pickup={pickupPoint ? { lat: pickupPoint.lat, lng: pickupPoint.lng, label: pickupPoint.label } : null}
                    delivery={hasCustomPin ? { lat: formData.customLat!, lng: formData.customLng!, label: 'Custom pin' } : null}
                    onSelectLocation={(lat, lng) => setFormData({ ...formData, customLat: lat, customLng: lng })}
                  />
                </React.Suspense>
                <Text variant="caption" tone="faint" className="mt-2 block">
                  {hasCustomPin ? 'Drag the pin to fine-tune it.' : 'Tap anywhere on the map to place the pin.'}
                </Text>

                <Text as="label" variant="label" tone="faint" htmlFor="custom-note" className="mb-2 mt-5 block">
                  Note for the deliverer
                </Text>
                <Textarea
                  id="custom-note"
                  placeholder="e.g. Outside TT Tower, near the north entrance"
                  value={formData.customNote}
                  onChange={(e) => setFormData({ ...formData, customNote: e.target.value })}
                  className="min-h-20 font-body"
                  maxLength={300}
                />
                <Text variant="caption" tone="faint" className="mt-1 block">
                  For finding the exact spot — this doesn&rsquo;t affect the route.
                </Text>
              </div>
            )}
          </div>
        )

      case 3:
        return (
          <div>
            <div className="flex items-baseline justify-between">
              <Text variant="label" tone="faint">Tip</Text>
              <Text variant="dataLg" tone="signalDeep" className="tabular-nums">₹{formData.tip[0]}</Text>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {TIP_PRESETS.map((amount) => (
                <ToggleButton key={amount} selected={formData.tip[0] === amount} onClick={() => setFormData({ ...formData, tip: [amount] })}>
                  ₹{amount}
                </ToggleButton>
              ))}
            </div>

            <Slider
              value={formData.tip}
              onValueChange={(value) => setFormData({ ...formData, tip: value })}
              max={200}
              min={10}
              step={5}
              className="mt-6"
              aria-label="Custom tip amount"
            />
            <div className="mt-1 flex justify-between">
              <Text variant="caption" tone="faint">₹10</Text>
              <Text variant="caption" tone="faint">₹200</Text>
            </div>

            {resolvedDistance != null && (
              <Text variant="caption" tone="faint" className="mt-4 block">
                {formatRouteEstimate(resolvedRoute!)}
              </Text>
            )}
          </div>
        )

      case 4:
        return <PostingPreview dense />

      default:
        return null
    }
  }

  const showInlinePreview = currentStep < 4 && (formData.restaurant !== '' || items.length > 0 || locationLabel !== '')

  return (
    <div className="md:grid md:grid-cols-[1fr_320px] md:items-start md:gap-16">
      <div className="max-w-measure" ref={topRef}>
        <div aria-live="polite" className="sr-only">
          Step {currentStep} of 4: {STEP_META[currentStep - 1].title}
        </div>

        <div className="mb-8">
          <div className="flex items-baseline justify-between">
            <Text variant="label" tone="faint" as="div">Post a request</Text>
            <Text variant="label" tone="faint" as="div" className="tabular-nums">{currentStep} / 4</Text>
          </div>
          <div className="mt-4 flex h-[3px] gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className={cn('flex-1 transition-colors duration-base ease-out', n <= currentStep ? 'bg-foreground' : 'bg-border')} />
            ))}
          </div>
          <Text variant="display" accent as="h1" className="mt-6 block text-[2.75rem] leading-[0.98] sm:text-[3.25rem]">
            {STEP_META[currentStep - 1].title}
          </Text>
          <Text variant="bodySm" tone="muted" as="p" className="mt-2">{STEP_META[currentStep - 1].subtitle}</Text>
        </div>

        {showInlinePreview && (
          <div className="mb-8 md:hidden">
            <PostingPreview dense />
          </div>
        )}

        <div key={currentStep} className="animate-rise-in">
          {renderStep()}
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <Button variant="ghost" onClick={handleBack} disabled={currentStep === 1}>
            Back
          </Button>

          {currentStep < 4 ? (
            <Button onClick={handleNext}>Continue</Button>
          ) : (
            <Button onClick={handleSubmit} loading={loading}>Post this request</Button>
          )}
        </div>

        {attemptedAdvance && currentIssue && (
          <Text variant="caption" tone="danger" className="mt-3 block text-right" role="alert">
            {currentIssue}
          </Text>
        )}
      </div>

      <aside className="hidden md:block">
        <PostingPreview />
      </aside>
    </div>
  )
}

export default PostRequest
