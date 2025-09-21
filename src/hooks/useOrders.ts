import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { OrderWithProfiles, Order } from '@/lib/database-types'

export const useOrders = () => {
  const [orders, setOrders] = useState<OrderWithProfiles[]>([])
  const [loading, setLoading] = useState(true)

  const fetchOrders = async (filters?: {
    status?: string
    friendsOnly?: boolean
    nearby?: boolean
    highTips?: boolean
    userId?: string
  }) => {
    try {
      setLoading(true)
      let query = supabase
        .from('orders')
        .select(`
          *,
          customer_profile:profiles!orders_customer_id_fkey(*),
          deliverer_profile:profiles!orders_deliverer_id_fkey(*)
        `)

      // Apply filters
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }

      if (filters?.nearby) {
        query = query.lt('distance', 1)
      }

      if (filters?.highTips) {
        query = query.gte('tip_amount', 40)
      }

      if (filters?.userId) {
        query = query.eq('customer_id', filters.userId)
      } else {
        // For home feed, only show pending orders
        query = query.eq('status', 'pending')
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) throw error

        // Add friend status if needed
        if (filters?.friendsOnly && filters?.userId) {
          const { data: friendships } = await supabase
            .from('friendships')
            .select('friend_id')
            .eq('user_id', filters.userId)

          const friendIds = friendships?.map((f: any) => f.friend_id) || []
          
          const friendOrders = data?.filter((order: any) => 
            friendIds.includes(order.customer_id)
          ).map((order: any) => ({ ...order, is_friend: true })) || []

          setOrders(friendOrders)
        } else {
          setOrders(data || [])
        }
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const createOrder = async (orderData: Omit<Order, 'id' | 'created_at' | 'updated_at' | 'otp_code'>) => {
    const { data, error } = await supabase
      .from('orders')
      .insert([{
        ...orderData,
        otp_code: Math.floor(100000 + Math.random() * 900000).toString(),
      }] as any)
      .select()

    if (error) throw error
    return data?.[0]
  }

  const acceptOrder = async (orderId: string, delivererId: string) => {
    const { data, error } = await (supabase as any)
      .from('orders')
      .update({
        deliverer_id: delivererId,
        status: 'accepted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select()
      .single()

    if (error) throw error
    return data
  }

  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    const updates: Partial<Order> = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (status === 'delivered') {
      updates.completed_at = new Date().toISOString()
    }

    const { data, error } = await (supabase as any)
      .from('orders')
      .update(updates)
      .eq('id', orderId)
      .select()

    if (error) throw error
    return data?.[0]
  }

  const subscribeToOrders = (callback: (payload: any) => void) => {
    const subscription = supabase
      .channel('orders')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'orders' },
        callback
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }

  return {
    orders,
    loading,
    fetchOrders,
    createOrder,
    acceptOrder,
    updateOrderStatus,
    subscribeToOrders,
  }
}