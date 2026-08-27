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
import { Text } from '@/components/primitives'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/utils'

export interface CancelOrderDialogProps {
  role: 'requester' | 'deliverer'
  /** Whether a deliverer has already accepted this order - only relevant
   * to the requester's copy (a still-unaccepted order affects no one else). */
  hasDeliverer: boolean
  onConfirm: () => Promise<void>
}

/**
 * A deliberately small, one-step confirmation - see
 * PHASE3_3G_DELIVERY_LIFECYCLE_SPEC.md §12. Same Dialog primitive
 * RatingDialog/EditProfileDialog/ChangePasswordDialog already use, not a
 * new interaction pattern. The trigger is a destructive-toned text link,
 * not a button, so it never visually competes with the real primary
 * lifecycle action (NEXT_DELIVERER_ACTION's button) sitting next to it.
 */
export function CancelOrderDialog({ role, hasDeliverer, onConfirm }: CancelOrderDialogProps) {
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)

  const isRequester = role === 'requester'
  const triggerLabel = isRequester ? 'Cancel this request' : "Can't complete this"
  const title = isRequester ? 'Cancel this request?' : 'Cancel this delivery?'
  const body = isRequester
    ? (hasDeliverer
        ? 'Whoever accepted it will be notified, and it comes off the board.'
        : "It hasn't been accepted yet - it'll come off the board.")
    : 'The requester will be notified and can look for someone else to carry it.'
  const confirmLabel = isRequester ? 'Cancel request' : 'Cancel delivery'

  const handleConfirm = async () => {
    setCancelling(true)
    try {
      await onConfirm()
      toast({ title: 'Cancelled' })
      setOpen(false)
    } catch (error) {
      toast({
        title: "Couldn't cancel",
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      })
    } finally {
      setCancelling(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="font-body text-body-sm font-semibold text-destructive underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {triggerLabel}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-h2 font-normal">{title}</DialogTitle>
        </DialogHeader>
        <Text variant="bodySm" tone="muted" as="p" className="py-2">{body}</Text>
        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose asChild>
            <Button variant="ghost" disabled={cancelling}>Never mind</Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleConfirm} loading={cancelling}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
