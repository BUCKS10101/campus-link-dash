import * as React from 'react'
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
import { Input } from '@/components/ui/input'
import { Text } from '@/components/primitives'
import { StarInput } from './StarInput'
import { useRatings } from '@/hooks/useRatings'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/utils'

export interface RatingDialogProps {
  orderId: string
  /** The other participant on this order - null only if their profile failed to load. */
  counterpartName: string | null
  onSubmitted: (orderId: string) => void
}

/**
 * "How did it go?" - a small, one-time prompt attached to a specific
 * delivered order (see MyOrders.tsx's "Earlier" section). Not a modal
 * that blocks the rest of the app: opens on demand, closes on submit or
 * cancel, never forced.
 */
export function RatingDialog({ orderId, counterpartName, onSubmitted }: RatingDialogProps) {
  const { submitRating } = useRatings()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [score, setScore] = React.useState(0)
  const [comment, setComment] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const reset = () => {
    setScore(0)
    setComment('')
  }

  const handleSubmit = async () => {
    if (score < 1) return
    setSaving(true)
    try {
      await submitRating(orderId, score, comment)
      toast({ title: 'Thanks — your rating was recorded.' })
      onSubmitted(orderId)
      setOpen(false)
    } catch (error) {
      toast({
        title: "Couldn't submit",
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) reset() }}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="font-body text-body-sm font-semibold text-primary-deep underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Rate this delivery
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-h2 font-normal">How did it go?</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5 py-2">
          {counterpartName && (
            <Text variant="bodySm" tone="muted">
              Rating {counterpartName}
            </Text>
          )}
          <StarInput value={score} onChange={setScore} disabled={saving} />
          <div className="flex flex-col gap-2">
            <Text as="label" variant="label" tone="faint" htmlFor="rating-comment">
              Comment (optional)
            </Text>
            <Input
              id="rating-comment"
              value={comment}
              maxLength={300}
              disabled={saving}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Anything worth mentioning?"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose asChild>
            <Button variant="ghost" disabled={saving}>Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} loading={saving} disabled={score < 1}>
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
