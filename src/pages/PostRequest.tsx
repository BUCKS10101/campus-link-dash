import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/useAuth'
import { useOrders } from '@/hooks/useOrders'
import { getErrorMessage, cn } from '@/lib/utils'
import { parseOrderItemsInput } from '@/lib/orderContent'
import type { DeliveryLocation } from '@/lib/orderContent'
import { Text, Rule } from '@/components/primitives'
import { createTimeline, DURATION, EASE } from '@/lib/motion/gsap'

const RESTAURANTS = [
  { id: 'one-food', name: 'One Food' },
  { id: 'dc-cafe', name: 'DC Cafe' },
  { id: 'campus-store', name: 'Campus Store' },
]

const HOSTEL_BLOCKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T']

const CAMPUS_LOCATIONS = ['TT Block', 'SJT Block', 'MB', 'PRP', 'GDN', 'Central Library', 'SMV', 'Academic Block']

const TIP_PRESETS = [20, 30, 50, 75, 100]

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
      'rounded-sm border px-4 py-2.5 font-body text-body-sm font-semibold transition-colors duration-fast ease-out',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      selected ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground',
      className,
    )}
  >
    {children}
  </button>
)

const randomDistance = () => Math.random() * 2 + 0.5
const calculateSuggestedTip = (distance: number) => Math.round(distance * 20)

const initialFormData = {
  restaurant: '',
  orderDescription: '',
  locationType: '',
  hostelType: '',
  block: '',
  campusLocation: '',
  tip: [30] as number[],
}

const PostRequest = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const { createOrder } = useOrders()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [attemptedAdvance, setAttemptedAdvance] = useState(false)
  const [posted, setPosted] = useState<{ tip: number; items: string; restaurant: string; location: string } | null>(null)
  const [formData, setFormData] = useState(initialFormData)
  const topRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLDivElement>(null)

  // Computed once per mount (and again on "post another"), not on every
  // render - Math.random() in the render body would reshuffle the tip
  // suggestion on every keystroke.
  const [distance, setDistance] = useState(randomDistance)
  const suggestedTip = calculateSuggestedTip(distance)

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
  const locationLabel = formData.locationType === 'hostels'
    ? (formData.block ? `${formData.hostelType === 'mens' ? "Men's" : 'Ladies'} Hostel ${formData.block}` : '')
    : formData.campusLocation

  const getStepIssue = (step: number): string | null => {
    switch (step) {
      case 1:
        if (!formData.restaurant) return 'Select where you’re ordering from.'
        if (items.length === 0) return 'Add at least one item.'
        return null
      case 2:
        if (!formData.locationType) return 'Pick a hostel or a campus location.'
        if (formData.locationType === 'hostels' && (!formData.hostelType || !formData.block)) return 'Pick a hostel and a block.'
        if (formData.locationType === 'campus' && !formData.campusLocation) return 'Pick a campus location.'
        return null
      default:
        return null
    }
  }

  const currentIssue = getStepIssue(currentStep)

  const resetForm = () => {
    setFormData(initialFormData)
    setDistance(randomDistance())
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

    setLoading(true)
    try {
      const restaurant = RESTAURANTS.find((r) => r.id === formData.restaurant)
      if (!restaurant) throw new Error('Please select a restaurant')

      const deliveryLocation: DeliveryLocation = formData.locationType === 'hostels'
        ? {
            type: 'hostel',
            label: `${formData.hostelType === 'mens' ? "Men's" : 'Ladies'} Hostel ${formData.block}`,
            hostelType: formData.hostelType as 'mens' | 'ladies',
            block: formData.block,
          }
        : { type: 'campus', label: formData.campusLocation }

      if (!deliveryLocation.label) throw new Error('Please select a delivery location')

      await createOrder({
        requester_id: user.user.id,
        deliverer_id: null,
        restaurant_name: restaurant.name,
        items,
        tip_amount: formData.tip[0],
        delivery_location: deliveryLocation,
        distance_km: distance,
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
      <Text variant="caption" tone="inherit" className="mt-1 block opacity-60">
        {distance.toFixed(1)} km · similar runs go for around ₹{suggestedTip}
      </Text>
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
          <Button onClick={() => navigate('/my-orders')}>View on Activity</Button>
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
            <div className="flex gap-2">
              <ToggleButton
                selected={formData.locationType === 'hostels'}
                onClick={() => setFormData({ ...formData, locationType: 'hostels', campusLocation: '' })}
                className="flex-1 text-center"
              >
                Hostels
              </ToggleButton>
              <ToggleButton
                selected={formData.locationType === 'campus'}
                onClick={() => setFormData({ ...formData, locationType: 'campus', hostelType: '', block: '' })}
                className="flex-1 text-center"
              >
                Campus
              </ToggleButton>
            </div>

            {formData.locationType === 'hostels' && (
              <div className="mt-5">
                <div className="flex gap-2">
                  {(['mens', 'ladies'] as const).map((t) => (
                    <ToggleButton
                      key={t}
                      selected={formData.hostelType === t}
                      onClick={() => setFormData({ ...formData, hostelType: t, block: '' })}
                      className="flex-1 text-center"
                    >
                      {t === 'mens' ? "Men's" : 'Ladies'}
                    </ToggleButton>
                  ))}
                </div>
                {formData.hostelType && (
                  <div className="mt-4">
                    <Text variant="label" tone="faint" as="div" className="mb-2">Block</Text>
                    <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                      {HOSTEL_BLOCKS.map((block) => (
                        <button
                          key={block}
                          type="button"
                          onClick={() => setFormData({ ...formData, block })}
                          aria-pressed={formData.block === block}
                          className={cn(
                            'aspect-square font-data text-body-sm font-medium transition-colors duration-fast ease-out',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            formData.block === block ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {block}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {formData.locationType === 'campus' && (
              <div className="mt-5">
                {CAMPUS_LOCATIONS.map((loc, i) => (
                  <React.Fragment key={loc}>
                    {i > 0 && <Rule />}
                    <OptionRow selected={formData.campusLocation === loc} onClick={() => setFormData({ ...formData, campusLocation: loc })}>
                      {loc}
                    </OptionRow>
                  </React.Fragment>
                ))}
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

            <Text variant="caption" tone="faint" className="mt-4 block">
              {distance.toFixed(1)} km · similar runs go for around ₹{suggestedTip}
            </Text>
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
