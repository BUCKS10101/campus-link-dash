import React, { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useFriends } from '@/hooks/useFriends'
import { useToast } from '@/hooks/use-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Text, Rule } from '@/components/primitives'
import { getErrorMessage } from '@/lib/utils'
import type { FriendshipWithProfiles, SearchProfileResult } from '@/lib/database-types'

const DEBOUNCE_MS = 400

const reputationLine = (r: { avg_rating: number | null; rating_count: number }): string =>
  r.rating_count > 0
    ? `${r.avg_rating?.toFixed(1)} · ${r.rating_count} rating${r.rating_count === 1 ? '' : 's'}`
    : 'No ratings yet'

/** "Find students" - a debounced name search, not a giant directory. */
const FindStudents = ({ onSent }: { onSent: () => void }) => {
  const { searchProfiles, sendFriendRequest } = useFriends()
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchProfileResult[]>([])
  const [searching, setSearching] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const handle = setTimeout(() => {
      searchProfiles(query).then((r) => {
        setResults(r)
        setSearching(false)
      })
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [query, searchProfiles])

  const handleAdd = async (id: string) => {
    setSendingId(id)
    try {
      await sendFriendRequest(id)
      setResults((prev) => prev.map((r) => (r.id === id ? { ...r, relationship: 'pending_outgoing' } : r)))
      toast({ title: 'Friend request sent' })
      onSent()
    } catch (err) {
      toast({ title: "Couldn't send request", description: getErrorMessage(err, 'Please try again.'), variant: 'destructive' })
    } finally {
      setSendingId(null)
    }
  }

  return (
    <div>
      <Text variant="label" tone="faint" as="div" className="pb-3">Find students</Text>
      <label htmlFor="find-students-search" className="sr-only">Search students by name</label>
      <Input
        id="find-students-search"
        placeholder="Search by name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mt-4 flex flex-col">
        {searching && <Text variant="bodySm" tone="muted">Searching…</Text>}
        {!searching && query.trim() && results.length === 0 && (
          <Text variant="bodySm" tone="muted">No students found.</Text>
        )}
        {results.map((r, i) => (
          <React.Fragment key={r.id}>
            {i > 0 && <Rule />}
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Text variant="bodySm" className="block font-semibold">{r.name}</Text>
                <Text variant="caption" tone="faint" as="p">{reputationLine(r)}</Text>
              </div>
              {r.relationship === 'none' && (
                <Button size="sm" loading={sendingId === r.id} onClick={() => handleAdd(r.id)}>Add</Button>
              )}
              {r.relationship === 'pending_outgoing' && <Text variant="caption" tone="muted">Pending</Text>}
              {r.relationship === 'pending_incoming' && <Text variant="caption" tone="muted">Requested you</Text>}
              {r.relationship === 'friends' && <Text variant="caption" tone="muted">Friends</Text>}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

const RequestRow = ({
  friendship,
  currentUserId,
  actionLabel,
  onAction,
  actionVariant = 'default',
  statusLabel,
}: {
  friendship: FriendshipWithProfiles
  currentUserId: string
  actionLabel: string
  onAction: () => Promise<void>
  actionVariant?: 'default' | 'ghost'
  /** e.g. "Pending" next to a Cancel action - the Sent section's own status text. */
  statusLabel?: string
}) => {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const otherName = friendship.requester_id === currentUserId
    ? friendship.addressee_profile.name
    : friendship.requester_profile.name

  const handleClick = async () => {
    setBusy(true)
    try {
      await onAction()
    } catch (err) {
      toast({ title: "Couldn't complete that", description: getErrorMessage(err, 'Please try again.'), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <Text variant="bodySm" className="font-semibold">{otherName}</Text>
      <div className="flex items-center gap-2">
        {statusLabel && <Text variant="caption" tone="muted">{statusLabel}</Text>}
        <Button size="sm" variant={actionVariant} loading={busy} onClick={handleClick} aria-label={`${actionLabel} - ${otherName}`}>
          {actionLabel}
        </Button>
      </div>
    </div>
  )
}

const EmptySection = ({ label }: { label: string }) => (
  <Text variant="bodySm" tone="muted" as="p" className="py-2">{label}</Text>
)

const Friends = () => {
  const { user, loading: authLoading } = useAuth()
  const { fetchMyFriendships, acceptFriendRequest, declineFriendRequest, cancelFriendRequest, removeFriend } = useFriends()
  const { toast } = useToast()

  const [friends, setFriends] = useState<FriendshipWithProfiles[]>([])
  const [received, setReceived] = useState<FriendshipWithProfiles[]>([])
  const [sent, setSent] = useState<FriendshipWithProfiles[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = () => {
    if (!user) return
    fetchMyFriendships(user.user.id).then(({ friends, received, sent }) => {
      setFriends(friends)
      setReceived(received)
      setSent(sent)
      setLoading(false)
    })
  }

  useEffect(() => {
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  if (authLoading || (loading && !user)) return null

  if (loading) {
    return (
      <div className="max-w-measure">
        <Skeleton className="h-8 w-32" />
        <div className="mt-8 flex flex-col gap-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="max-w-measure">
      <div className="border-b-2 border-foreground pb-6">
        <Text variant="label" tone="faint" as="div">Friends</Text>
        <Text variant="display" accent className="mt-2 block">{friends.length}</Text>
      </div>

      <div className="mt-10">
        <Text variant="label" tone="faint" as="div" className="pb-3">Friends</Text>
        {friends.length === 0 ? (
          <EmptySection label="No friends yet - find someone below." />
        ) : (
          friends.map((f, i) => (
            <React.Fragment key={f.id}>
              {i > 0 && <Rule />}
              <RequestRow
                friendship={f}
                currentUserId={user.user.id}
                actionLabel="Remove"
                actionVariant="ghost"
                onAction={async () => {
                  await removeFriend(f.id)
                  toast({ title: 'Friend removed' })
                  refetch()
                }}
              />
            </React.Fragment>
          ))
        )}
      </div>

      <div className="mt-10 border-t border-border pt-6">
        <Text variant="label" tone="faint" as="div" className="pb-3">Requests received</Text>
        {received.length === 0 ? (
          <EmptySection label="No pending requests." />
        ) : (
          received.map((f, i) => (
            <React.Fragment key={f.id}>
              {i > 0 && <Rule />}
              <div className="flex items-center justify-between gap-4 py-3">
                <Text variant="bodySm" className="font-semibold">{f.requester_profile.name}</Text>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Decline - ${f.requester_profile.name}`}
                    onClick={async () => {
                      try {
                        await declineFriendRequest(f.id)
                        refetch()
                      } catch (err) {
                        toast({ title: "Couldn't decline", description: getErrorMessage(err, 'Please try again.'), variant: 'destructive' })
                      }
                    }}
                  >
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    aria-label={`Accept - ${f.requester_profile.name}`}
                    onClick={async () => {
                      try {
                        await acceptFriendRequest(f.id)
                        toast({ title: 'Friend request accepted' })
                        refetch()
                      } catch (err) {
                        toast({ title: "Couldn't accept", description: getErrorMessage(err, 'Please try again.'), variant: 'destructive' })
                      }
                    }}
                  >
                    Accept
                  </Button>
                </div>
              </div>
            </React.Fragment>
          ))
        )}
      </div>

      <div className="mt-10 border-t border-border pt-6">
        <Text variant="label" tone="faint" as="div" className="pb-3">Requests sent</Text>
        {sent.length === 0 ? (
          <EmptySection label="No outgoing requests." />
        ) : (
          sent.map((f, i) => (
            <React.Fragment key={f.id}>
              {i > 0 && <Rule />}
              <RequestRow
                friendship={f}
                currentUserId={user.user.id}
                actionLabel="Cancel"
                actionVariant="ghost"
                statusLabel="Pending"
                onAction={async () => {
                  await cancelFriendRequest(f.id)
                  refetch()
                }}
              />
            </React.Fragment>
          ))
        )}
      </div>

      <div className="mt-10 border-t border-border pt-6">
        <FindStudents onSent={refetch} />
      </div>
    </div>
  )
}

export default Friends
