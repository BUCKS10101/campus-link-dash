import React, { useState } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Text } from '@/components/primitives'
import { useCampusPoints, CAMPUS_POINT_CATEGORIES } from '@/hooks/useCampusPoints'
import { useDiscoveryLocation } from '@/hooks/useDiscoveryLocation'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage, cn } from '@/lib/utils'
import type { UserPreferences } from '@/lib/database-types'
import type { PreferencesUpdate } from '@/hooks/usePreferences'

// Campus-scale presets only - VIT's campus is walkable end-to-end in well
// under a kilometer for any single building-to-building hop, so 1km/2km
// never meaningfully narrowed anything and were removed. Stored as km
// internally (the column and haversineDistanceKm both work in km), but
// every value here is chosen, labeled, and reasoned about in meters.
const RADIUS_PRESETS_KM = [0.05, 0.1, 0.2, 0.5]
// The default applied the first time a user turns live location on and
// hasn't chosen a radius yet - a mid-sized, walkable-in-a-couple-minutes
// campus radius, not the widest or narrowest preset.
const DEFAULT_RADIUS_KM = 0.2
const radiusLabel = (km: number) => `${Math.round(km * 1000)} m`

export interface DiscoverySettingsProps {
  userId: string
  preferences: UserPreferences
  preferredPointIds: ReadonlySet<string>
  savePreferences: (userId: string, updates: PreferencesUpdate) => Promise<void>
  savePreferredPoints: (userId: string, pointIds: readonly string[]) => Promise<void>
  resetPreferences: (userId: string) => Promise<void>
}

/**
 * Phase 3H — see PHASE3_3H_PREFERENCES_PERSONALIZATION_SPEC.md §11. Two
 * discovery modes, never both applied at once (Home decides which is
 * active - see the spec's §3.5): live device location (Mode A) with a
 * straight-line radius, or preferred campus areas (Mode B), the automatic
 * fallback.
 *
 * This component calls the same one-shot `useDiscoveryLocation` hook Home
 * does, keyed off the same saved preference - so turning the toggle on
 * requests the browser's permission prompt immediately, right here on
 * Settings, rather than silently deferring it until the user happens to
 * open Home. A denied/unavailable/unsupported/timed-out result is shown
 * inline (never claimed as active); Home performs its own independent
 * one-shot read when it mounts, so nothing here needs to hand a
 * coordinate off to another page or store one anywhere.
 *
 * Preferences are the shared PreferencesProvider instance (App.tsx),
 * passed down from Settings - this component only ever reads/writes
 * through the props below, never fetches on its own.
 */
export function DiscoverySettings({
  userId,
  preferences,
  preferredPointIds,
  savePreferences,
  savePreferredPoints,
  resetPreferences,
}: DiscoverySettingsProps) {
  const { toast } = useToast()
  const { byCategory } = useCampusPoints()
  const discoveryLocation = useDiscoveryLocation(preferences.use_live_location)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftPointIds, setDraftPointIds] = useState<Set<string>>(new Set())
  const [savingAreas, setSavingAreas] = useState(false)
  const [resetting, setResetting] = useState(false)

  // Checked once per session, not read reactively - support for the API
  // itself doesn't change while the tab is open. Per spec §3.4, an
  // unsupported browser doesn't get offered a broken toggle at all.
  const [geolocationSupported] = useState(() => typeof navigator !== 'undefined' && !!navigator.geolocation)

  const handleToggleLiveLocation = async (checked: boolean) => {
    try {
      await savePreferences(userId, {
        use_live_location: checked,
        // A sensible campus-scale default the first time this is turned
        // on, so enabling it is never a no-op waiting on a separate radius
        // pick - never silently defaults to the old 1km/2km values.
        ...(checked && preferences.discovery_radius_km == null ? { discovery_radius_km: DEFAULT_RADIUS_KM } : {}),
      })
    } catch (error) {
      toast({ title: 'Could not save', description: getErrorMessage(error, 'Please try again.'), variant: 'destructive' })
    }
  }

  const handleSelectRadius = async (km: number) => {
    try {
      await savePreferences(userId, { discovery_radius_km: km })
    } catch (error) {
      toast({ title: 'Could not save', description: getErrorMessage(error, 'Please try again.'), variant: 'destructive' })
    }
  }

  const handleSaveAreas = async () => {
    setSavingAreas(true)
    try {
      await savePreferredPoints(userId, Array.from(draftPointIds))
      toast({ title: 'Saved' })
      setPickerOpen(false)
    } catch (error) {
      toast({ title: 'Could not save', description: getErrorMessage(error, 'Please try again.'), variant: 'destructive' })
    } finally {
      setSavingAreas(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    try {
      await resetPreferences(userId)
      toast({ title: 'Discovery preferences reset' })
    } catch (error) {
      toast({ title: 'Could not reset', description: getErrorMessage(error, 'Please try again.'), variant: 'destructive' })
    } finally {
      setResetting(false)
    }
  }

  const preferredLabels = CAMPUS_POINT_CATEGORIES.flatMap(({ kind }) => byCategory(kind))
    .filter((p) => preferredPointIds.has(p.id))
    .map((p) => p.label)

  return (
    <>
      {geolocationSupported ? (
        <div className="flex items-center justify-between gap-4 border-b-2 border-foreground py-6">
          <div className="min-w-0">
            <Text variant="h3" className="block">Use my current location</Text>
            <Text variant="caption" tone="muted" as="p" className="mt-0.5">
              Uses your device's location to show errands near where you are right now, as the crow flies —
              not a walking distance. Your location is never saved or shown to anyone; it's only read in
              your browser while this feature is on.
            </Text>
          </div>
          <div className="shrink-0">
            <Switch
              checked={preferences.use_live_location}
              onCheckedChange={handleToggleLiveLocation}
              aria-label="Use my current location"
            />
          </div>
        </div>
      ) : (
        <div className="border-b-2 border-foreground py-6">
          <Text variant="h3" className="block">Use my current location</Text>
          <Text variant="caption" tone="muted" as="p" className="mt-0.5">
            Your browser doesn't support location — using your preferred areas below instead.
          </Text>
        </div>
      )}

      {preferences.use_live_location && geolocationSupported && (
        <div className="flex items-center gap-3 border-b-2 border-foreground py-6">
          <Text variant="label" tone="faint">Radius</Text>
          <div className="flex gap-2">
            {RADIUS_PRESETS_KM.map((km) => (
              <button
                key={km}
                type="button"
                onClick={() => handleSelectRadius(km)}
                aria-pressed={preferences.discovery_radius_km === km}
                className={cn(
                  'rounded-full border px-3 py-1.5 font-body text-body-sm font-semibold transition-colors duration-fast ease-out',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  preferences.discovery_radius_km === km
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-transparent text-foreground hover:border-border-strong',
                )}
              >
                {radiusLabel(km)}
              </button>
            ))}
          </div>
        </div>
      )}

      {preferences.use_live_location && geolocationSupported && (
        <SettingsStatusLine
          status={discoveryLocation.status}
          hasPreferredAreas={preferredPointIds.size > 0}
        />
      )}

      <div className="flex items-center justify-between gap-4 border-b-2 border-foreground py-6">
        <div className="min-w-0">
          <Text variant="h3" className="block">Preferred areas</Text>
          <Text variant="caption" tone="muted" as="p" className="mt-0.5">
            {preferredLabels.length > 0
              ? preferredLabels.join(', ')
              : "None selected yet — used automatically whenever current location is off or unavailable."}
          </Text>
        </div>
        <div className="shrink-0">
          <Dialog
            open={pickerOpen}
            onOpenChange={(next) => {
              setPickerOpen(next)
              if (next) setDraftPointIds(new Set(preferredPointIds))
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">Choose areas</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display text-h2 font-normal">Preferred areas</DialogTitle>
              </DialogHeader>
              <div className="flex max-h-[50vh] flex-col gap-5 overflow-y-auto py-2">
                {CAMPUS_POINT_CATEGORIES.map(({ kind, label }) => {
                  const categoryPoints = byCategory(kind)
                  if (categoryPoints.length === 0) return null
                  return (
                    <div key={kind}>
                      <Text variant="label" tone="faint" as="div" className="pb-2">{label}</Text>
                      <div className="flex flex-col gap-2">
                        {categoryPoints.map((point) => (
                          <label key={point.id} className="flex items-center gap-2 font-body text-body-sm">
                            <input
                              type="checkbox"
                              className="size-4"
                              checked={draftPointIds.has(point.id)}
                              onChange={(e) => {
                                setDraftPointIds((prev) => {
                                  const next = new Set(prev)
                                  if (e.target.checked) next.add(point.id)
                                  else next.delete(point.id)
                                  return next
                                })
                              }}
                            />
                            {point.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              <DialogFooter className="gap-2 sm:gap-2">
                <DialogClose asChild>
                  <Button variant="ghost" disabled={savingAreas}>Cancel</Button>
                </DialogClose>
                <Button onClick={handleSaveAreas} loading={savingAreas}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center justify-between py-6">
        <Text variant="caption" tone="muted" as="p">
          Resets current location, radius, and preferred areas back to their defaults.
        </Text>
        <Button variant="ghost" size="sm" onClick={handleReset} loading={resetting}>
          Reset discovery preferences
        </Button>
      </div>
    </>
  )
}

/** A short, honest note about the actual, current permission/read result -
 * never claims GPS is active when it isn't, never silent about a
 * fallback. Mirrors the copy Home itself shows (see Home.tsx's
 * discoveryFallbackNote) so the same state reads the same way on both
 * pages. */
function SettingsStatusLine({
  status,
  hasPreferredAreas,
}: {
  status: 'idle' | 'unsupported' | 'requesting' | 'granted' | 'denied' | 'unavailable' | 'timeout'
  hasPreferredAreas: boolean
}) {
  const fallback = hasPreferredAreas ? 'your preferred areas below' : 'the full board'
  const text = (() => {
    switch (status) {
      case 'requesting': return 'Getting your location…'
      case 'granted': return 'Location access granted — Home will show errands within your chosen radius.'
      case 'denied': return `Location access is off in your browser — Home will show ${fallback} instead.`
      case 'unavailable': return `Couldn't get your location — Home will show ${fallback} instead.`
      case 'timeout': return `Location took too long — Home will show ${fallback} instead. Try again by toggling this off and on.`
      default: return null
    }
  })()
  if (!text) return null
  return (
    <Text variant="caption" tone="faint" as="p" className="border-b border-border pb-4 pt-0">
      {text}
    </Text>
  )
}
