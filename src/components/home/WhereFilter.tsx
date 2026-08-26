import * as React from 'react'
import { Check, ChevronsUpDown, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Text } from '@/components/primitives'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import type { CampusPoint } from '@/lib/database-types'
import type { LocationFilter } from '@/lib/ranking'

/**
 * One campus-point search/select field ("From" or "To") - a standard
 * combobox (trigger button + searchable list), not a giant native
 * <select> the user has to scroll through. Reuses the app's existing
 * Popover/Command primitives, already used elsewhere for exactly this
 * pattern - no new dependency.
 */
const CampusPointCombobox = ({
  points,
  valueId,
  onChange,
  placeholder,
  label,
}: {
  points: CampusPoint[]
  valueId: string | null
  onChange: (id: string | null) => void
  placeholder: string
  label: string
}) => {
  const [open, setOpen] = React.useState(false)
  const selected = points.find((p) => p.id === valueId)

  return (
    <div className="flex flex-col gap-1.5">
      <Text variant="label" tone="faint" as="span" id={`where-${label}-label`}>
        {label}
      </Text>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={`where-${label}-label`}
            className="w-full justify-between font-body text-body-sm font-normal"
          >
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>
              {selected ? selected.label : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search campus locations…`} />
            <CommandList>
              <CommandEmpty>No location found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__any__"
                  onSelect={() => {
                    onChange(null)
                    setOpen(false)
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', valueId == null ? 'opacity-100' : 'opacity-0')} />
                  {placeholder}
                </CommandItem>
                {points.map((point) => (
                  <CommandItem
                    key={point.id}
                    value={point.label}
                    onSelect={() => {
                      onChange(point.id)
                      setOpen(false)
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', valueId === point.id ? 'opacity-100' : 'opacity-0')} />
                    {point.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

const WhereFields = ({
  points,
  draft,
  setDraft,
}: {
  points: CampusPoint[]
  draft: LocationFilter
  setDraft: React.Dispatch<React.SetStateAction<LocationFilter>>
}) => (
  <div className="flex flex-col gap-4">
    <CampusPointCombobox
      label="From"
      placeholder="Any starting point"
      points={points}
      valueId={draft.pickupPointId}
      onChange={(id) => setDraft((d) => ({ ...d, pickupPointId: id }))}
    />
    <CampusPointCombobox
      label="To"
      placeholder="Any destination"
      points={points}
      valueId={draft.deliveryPointId}
      onChange={(id) => setDraft((d) => ({ ...d, deliveryPointId: id }))}
    />
  </div>
)

export interface WhereFilterProps {
  points: CampusPoint[]
  value: LocationFilter
  onApply: (next: LocationFilter) => void
  onClear: () => void
  /** Compact summary shown on the trigger once a filter is applied, e.g. "From: Balaji Store · To: TT". */
  summary: string | null
}

/**
 * "Where" — desktop gets a Popover, mobile gets a bottom Sheet (so it
 * stays usable above the fixed nav bar), sharing the same From/To
 * fields. Editing happens in local draft state; nothing is applied to
 * Home's actual filter (and nothing re-renders the board) until Apply is
 * pressed - Clear resets and applies immediately.
 */
export const WhereFilter = ({ points, value, onApply, onClear, summary }: WhereFilterProps) => {
  const isMobile = useIsMobile()
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<LocationFilter>(value)

  const openWithDraft = (nextOpen: boolean) => {
    if (nextOpen) setDraft(value)
    setOpen(nextOpen)
  }

  const handleApply = () => {
    onApply(draft)
    setOpen(false)
  }

  const handleClear = () => {
    setDraft({ pickupPointId: null, deliveryPointId: null })
    onClear()
    setOpen(false)
  }

  const trigger = (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        'rounded-sm px-3 py-1.5 font-body text-body-sm font-medium',
        summary && 'border-foreground',
      )}
    >
      <MapPin className="h-3.5 w-3.5 opacity-70" />
      {summary ?? 'Where'}
    </Button>
  )

  const panel = (
    <>
      <WhereFields points={points} draft={draft} setDraft={setDraft} />
      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={handleClear}>
          Clear
        </Button>
        <Button size="sm" onClick={handleApply}>
          Apply
        </Button>
      </div>
    </>
  )

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={openWithDraft}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-md">
          <SheetHeader>
            <SheetTitle className="text-left font-display">Where</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{panel}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover open={open} onOpenChange={openWithDraft}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <Text variant="label" tone="faint" as="div" className="mb-3">
          Where
        </Text>
        {panel}
      </PopoverContent>
    </Popover>
  )
}

export default WhereFilter
