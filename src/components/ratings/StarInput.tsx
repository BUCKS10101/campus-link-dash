import * as React from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StarInputProps {
  value: number
  onChange: (score: number) => void
  disabled?: boolean
}

/**
 * A real labeled control, not a row of clickable divs - each star has its
 * own accessible name (score never conveyed by fill color alone).
 */
export function StarInput({ value, onChange, disabled }: StarInputProps) {
  return (
    <div role="radiogroup" aria-label="Rating out of 5 stars" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          disabled={disabled}
          onClick={() => onChange(n)}
          className={cn(
            'rounded-sm p-1.5 transition-colors duration-fast ease-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:pointer-events-none disabled:opacity-60',
          )}
        >
          <Star
            className={cn('size-7', n <= value ? 'fill-primary text-primary' : 'text-muted-foreground')}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  )
}
