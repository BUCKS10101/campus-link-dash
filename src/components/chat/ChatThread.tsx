import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle } from 'lucide-react'
import { useChat } from '@/hooks/useChat'
import { useToast } from '@/hooks/use-toast'
import { Text } from '@/components/primitives'
import { cn, getErrorMessage } from '@/lib/utils'

export interface ChatThreadProps {
  orderId: string
  currentUserId: string
  /** The person on the other end of this order - null while unassigned. */
  counterpartName: string | null
  /** "Restaurant → destination", already formatted by the caller. */
  contextLine: string
}

/**
 * Groups consecutive messages from the same sender so the name/alignment
 * only has to be established once per run, not repeated on every line.
 */
const groupMessages = <T extends { sender_id: string }>(messages: T[]): T[][] => {
  const groups: T[][] = []
  for (const message of messages) {
    const last = groups[groups.length - 1]
    if (last && last[0].sender_id === message.sender_id) {
      last.push(message)
    } else {
      groups.push([message])
    }
  }
  return groups
}

const ChatSkeleton = () => (
  <div className="flex flex-col gap-3" aria-hidden="true">
    <Skeleton className="h-10 w-3/5" />
    <Skeleton className="ml-auto h-10 w-2/5" />
    <Skeleton className="h-10 w-1/2" />
  </div>
)

/**
 * The conversation attached to one order - not a general-purpose messaging
 * product. Order context stays quiet and small; the conversation itself
 * carries the visual weight.
 */
export function ChatThread({ orderId, currentUserId, counterpartName, contextLine }: ChatThreadProps) {
  const { messages, loading, error, sendMessage, refetch } = useChat(orderId)
  const { toast } = useToast()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      await sendMessage(draft, currentUserId)
      setDraft('')
    } catch (err) {
      // The composer keeps the draft so the user can retry without retyping.
      toast({
        title: "Couldn't send",
        description: getErrorMessage(err, 'Please try again.'),
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  const groups = groupMessages(messages)

  return (
    <div className="mt-6 border-t-2 border-foreground pt-6">
      <div className="flex items-baseline justify-between gap-3">
        <Text variant="h3" as="div">Chat</Text>
        <Text variant="caption" tone="faint" className="truncate text-right">{contextLine}</Text>
      </div>

      <div
        role="log"
        aria-live="polite"
        aria-label={counterpartName ? `Conversation with ${counterpartName}` : 'Conversation'}
        className="mt-5 flex h-64 flex-col gap-4 overflow-y-auto"
      >
        {loading && <ChatSkeleton />}

        {error && !loading && (
          <div className="m-auto flex flex-col items-center gap-3 text-center">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button variant="outline" size="sm" onClick={refetch}>Try again</Button>
          </div>
        )}

        {!loading && !error && messages.length === 0 && (
          <div className="m-auto max-w-[34ch] text-center">
            <Text variant="body" tone="muted" accent>
              {counterpartName
                ? `This is your line to ${counterpartName}. Say hello.`
                : 'This is your line to whoever takes this run.'}
            </Text>
          </div>
        )}

        {!loading && !error && groups.map((group) => {
          const mine = group[0].sender_id === currentUserId
          return (
            <div key={group[0].id} className={cn('flex flex-col gap-1.5', mine ? 'items-end' : 'items-start')}>
              {!mine && (
                <Text variant="label" tone="faint" className="px-0.5">
                  {group[0].sender_profile?.name || 'Them'}
                </Text>
              )}
              {group.map((msg) => (
                <div
                  key={msg.id}
                  // Each message keeps a stable key, so this animation only
                  // plays once, on the message's actual arrival - not on
                  // every re-render of the thread (e.g. composer keystrokes).
                  className={cn(
                    'animate-rise-in max-w-[85%] px-3.5 py-2.5',
                    mine ? 'rounded-sm bg-primary-soft' : 'border-l-2 border-border pl-3.5',
                  )}
                >
                  <Text variant="body">{msg.message}</Text>
                  <Text variant="caption" tone="faint" as="p" className="mt-1">
                    {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric' })}
                  </Text>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-end gap-2">
        <label htmlFor={`chat-composer-${orderId}`} className="sr-only">Message</label>
        <Input
          id={`chat-composer-${orderId}`}
          placeholder="Message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          maxLength={1000}
          disabled={sending}
        />
        <Button onClick={handleSend} loading={sending} disabled={!draft.trim()} size="sm">
          Send
        </Button>
      </div>
    </div>
  )
}
