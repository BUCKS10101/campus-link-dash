import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { ChatMessageWithProfile } from '@/lib/database-types'
import { ChatMessageSchema, validateOrThrow } from '@/lib/validation'
import { getErrorMessage } from '@/lib/utils'

export const useChat = (orderId: string) => {
  const [messages, setMessages] = useState<ChatMessageWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!orderId) return

    fetchMessages()
    // subscribeToMessages() returns an unsubscribe function - it must be
    // wired into this effect's cleanup, otherwise every orderId change
    // (or remount) leaks a realtime channel subscription.
    const unsubscribe = subscribeToMessages()
    return unsubscribe
  }, [orderId])

  const fetchMessages = async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('chat_messages')
        .select(`
          *,
          sender_profile:profiles(*)
        `)
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })

      if (error) throw error
      setMessages(data || [])
    } catch (err) {
      // RLS returns an empty result rather than an error for rows you're
      // not allowed to see, but a genuinely bad/unauthorized orderId (e.g.
      // one that fails the chat_select_participant policy entirely) still
      // surfaces here as a fetch error - report it instead of silently
      // showing an empty chat.
      const message = getErrorMessage(err, 'Failed to load messages')
      console.error('Error fetching messages:', err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  // chat_messages has no sender_type column - message-bubble alignment
  // (who's "me" vs "them") is derived by comparing sender_id to the
  // viewer's own id in MyOrders.tsx, not from a stored role.
  const sendMessage = async (message: string, senderId: string) => {
    const validated = validateOrThrow(ChatMessageSchema, { message })

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert([{
          order_id: orderId,
          sender_id: senderId,
          message: validated.message,
        }] as any)
        .select(`
          *,
          sender_profile:profiles(*)
        `)

      if (error) throw error
      return data?.[0] as ChatMessageWithProfile
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  }

  const subscribeToMessages = () => {
    const subscription = supabase
      .channel(`chat_messages:order_id=eq.${orderId}`)
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          // Fetch the complete message with profile data
          supabase
            .from('chat_messages')
            .select(`
              *,
              sender_profile:profiles(*)
            `)
            .eq('id', payload.new.id)
            .single()
            .then(({ data }) => {
              if (data) {
                setMessages(prev => [...prev, data])
              }
            })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }

  return {
    messages,
    loading,
    error,
    sendMessage,
    refetch: fetchMessages,
  }
}
