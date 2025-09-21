import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { ChatMessageWithProfile } from '@/lib/database-types'

export const useChat = (orderId: string) => {
  const [messages, setMessages] = useState<ChatMessageWithProfile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (orderId) {
      fetchMessages()
      subscribeToMessages()
    }
  }, [orderId])

  const fetchMessages = async () => {
    try {
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
    } catch (error) {
      console.error('Error fetching messages:', error)
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async (message: string, senderId: string, senderType: 'customer' | 'deliverer') => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert([{
          order_id: orderId,
          sender_id: senderId,
          sender_type: senderType,
          message,
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
    sendMessage,
    refetch: fetchMessages,
  }
}