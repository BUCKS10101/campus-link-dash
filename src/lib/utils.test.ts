import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  // Regression test for a real bug: tailwind-merge's default config only
  // recognises Tailwind's built-in text-xs..text-9xl suffixes as the
  // font-size class group, so every one of this project's custom
  // fontSize keys (text-body, text-h2, ...) fell into the text-COLOR
  // group instead. When a color utility and one of these size utilities
  // appeared in the same cn() call, twMerge treated them as conflicting
  // members of one group and silently dropped whichever came first -
  // in practice this deleted `text-primary-foreground` from every
  // default-variant <Button/>, so button text rendered as an inherited
  // color instead of its intended one. See src/lib/utils.ts.
  it('keeps a text-color utility when combined with a custom font-size utility', () => {
    expect(cn('text-body', 'text-primary-foreground')).toBe('text-body text-primary-foreground')
    expect(cn('text-primary-foreground', 'text-body')).toBe('text-primary-foreground text-body')
  })

  it.each(['display', 'display-sm', 'h1', 'h2', 'h3', 'body', 'body-sm', 'caption', 'label', 'data', 'data-lg'])(
    'keeps text-%s alongside a text-color utility in both orders',
    (size) => {
      expect(cn(`text-${size}`, 'text-foreground')).toBe(`text-${size} text-foreground`)
      expect(cn('text-foreground', `text-${size}`)).toBe(`text-foreground text-${size}`)
    },
  )

  it('still resolves genuine font-size conflicts to the last one', () => {
    expect(cn('text-body', 'text-h2')).toBe('text-h2')
  })

  it('still resolves genuine text-color conflicts to the last one', () => {
    expect(cn('text-foreground', 'text-primary-foreground')).toBe('text-primary-foreground')
  })
})
