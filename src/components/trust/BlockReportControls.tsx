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
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Text } from '@/components/primitives'
import { useBlocks } from '@/hooks/useBlocks'
import { useReports } from '@/hooks/useReports'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/utils'
import type { ReportReason } from '@/lib/database-types'

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'no_show', label: "Didn't show up" },
  { value: 'unsafe_behavior', label: 'Unsafe behavior' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'suspected_fake_account', label: 'Suspected fake account' },
  { value: 'other', label: 'Other' },
]

const linkClass =
  'font-body text-body-sm font-semibold underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/**
 * Phase 3J - see PHASE3_3J_TRUST_SAFETY_SPEC.md §4/§5/§8. Deliberately
 * placed only in the order-detail action row (near the existing cancel
 * action, ActiveOrdersSection.tsx) - the spec's "single most natural
 * entry point" for both block and report, since a real bad interaction
 * almost always originates from a specific order. This codebase has no
 * standalone "view a stranger's profile" page to attach a second entry
 * point to - the spec's own suggested "Profile viewing someone else's"
 * placement doesn't have anywhere to live yet, so it's intentionally not
 * invented here (would be new-page scope beyond 3J's approved surface).
 *
 * Two distinct actions/RPCs (block_user/unblock_user, file_report) -
 * never merged into one "block and report" combo call, per spec §5.
 */
export function BlockReportControls({
  targetUserId,
  targetName,
  orderId,
}: {
  targetUserId: string
  targetName: string
  orderId: string
}) {
  const { blockUser, unblockUser, isBlocked, loading: blockLoading } = useBlocks()
  const { fileReport, loading: reportLoading } = useReports()
  const { toast } = useToast()
  const [blocked, setBlocked] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    isBlocked(targetUserId).then((result) => { if (!cancelled) setBlocked(result) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUserId])
  const [blockDialogOpen, setBlockDialogOpen] = React.useState(false)
  const [reportDialogOpen, setReportDialogOpen] = React.useState(false)
  const [reason, setReason] = React.useState<ReportReason | ''>('')
  const [description, setDescription] = React.useState('')

  const handleToggleBlock = async () => {
    try {
      if (blocked) {
        await unblockUser(targetUserId)
        setBlocked(false)
        toast({ title: `Unblocked ${targetName}` })
      } else {
        await blockUser(targetUserId)
        setBlocked(true)
        toast({ title: `Blocked ${targetName}` })
      }
      setBlockDialogOpen(false)
    } catch (error) {
      toast({
        title: blocked ? "Couldn't unblock" : "Couldn't block",
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      })
    }
  }

  const resetReportForm = () => {
    setReason('')
    setDescription('')
  }

  const handleSubmitReport = async () => {
    if (!reason) return
    try {
      await fileReport(targetUserId, reason, description, orderId)
      toast({ title: 'Report submitted', description: 'Thanks for letting us know.' })
      setReportDialogOpen(false)
      resetReportForm()
    } catch (error) {
      toast({
        title: "Couldn't submit report",
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogTrigger asChild>
          <button type="button" className={`${linkClass} text-muted-foreground hover:text-foreground`}>
            {blocked ? `Unblock ${targetName}` : `Block ${targetName}`}
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-h2 font-normal">
              {blocked ? `Unblock ${targetName}?` : `Block ${targetName}?`}
            </DialogTitle>
          </DialogHeader>
          <Text variant="bodySm" tone="muted" as="p" className="py-2">
            {blocked
              ? "You'll be able to message and be matched with them again."
              : "They won't be able to message you or accept your orders, and you won't be matched with them again. Your active orders and existing chat history are unaffected."}
          </Text>
          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button variant="ghost" disabled={blockLoading}>Never mind</Button>
            </DialogClose>
            <Button variant={blocked ? 'default' : 'destructive'} onClick={handleToggleBlock} loading={blockLoading}>
              {blocked ? 'Unblock' : 'Block'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reportDialogOpen} onOpenChange={(next) => { setReportDialogOpen(next); if (next) resetReportForm() }}>
        <DialogTrigger asChild>
          <button type="button" className={`${linkClass} text-destructive`}>
            Report {targetName}
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-h2 font-normal">Report {targetName}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5 py-2">
            <div className="flex flex-col gap-2">
              <Text as="span" variant="label" tone="faint">Reason</Text>
              <RadioGroup value={reason} onValueChange={(v) => setReason(v as ReportReason)}>
                {REPORT_REASONS.map((r) => (
                  <label key={r.value} className="flex items-center gap-2 font-body text-body-sm">
                    <RadioGroupItem value={r.value} id={`report-reason-${r.value}`} />
                    {r.label}
                  </label>
                ))}
              </RadioGroup>
            </div>
            <div className="flex flex-col gap-2">
              <Text as="label" variant="label" tone="faint" htmlFor="report-description">
                Details (optional)
              </Text>
              <Textarea
                id="report-description"
                value={description}
                maxLength={500}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What happened?"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button variant="ghost" disabled={reportLoading}>Cancel</Button>
            </DialogClose>
            <Button onClick={handleSubmitReport} loading={reportLoading} disabled={!reason}>
              Submit report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
