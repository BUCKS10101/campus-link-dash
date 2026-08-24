import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { OrderWithProfiles, Order } from '@/lib/database-types'
import { isValidOrderStatusTransition } from '@/lib/orderStatus'
import { PostOrderSchema, OtpCodeSchema, validateOrThrow } from '@/lib/validation'
import { getErrorMessage } from '@/lib/utils'

// Deliberately excludes otp: that column's SELECT privilege is revoked in
// supabase/migrations/20260824120300_otp_verification.sql, so a bare
// `select('*')` here would fail with "permission denied for column otp"
// for every order fetch/insert/update. Use get_my_order_otp()/
// verify_delivery_otp() (see below) instead.
const ORDER_COLUMNS = `
  id, requester_id, deliverer_id, restaurant_name, items, tip_amount,
  delivery_location, distance_km, status, created_at
`

const ORDER_COLUMNS_WITH_PROFILES = `
  ${ORDER_COLUMNS},
  requester_profile:profiles!orders_requester_id_fkey(*),
  deliverer_profile:profiles!orders_deliverer_id_fkey(*)
`

export const useOrders = () => {
  const [orders, setOrders] = useState<OrderWithProfiles[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOrders = async (filters?: {
    status?: string
    friendsOnly?: boolean
    nearby?: boolean
    highTips?: boolean
    /** current viewer's id - only used to resolve their friends list for friendsOnly */
    viewerId?: string
    /** scope results to orders THIS user posted/is delivering, instead of the public feed */
    mine?: { as: 'customer' | 'deliverer'; userId: string } | { as: 'either'; userId: string }
  }) => {
    try {
      setLoading(true)
      setError(null)
      let query = supabase.from('orders').select(ORDER_COLUMNS_WITH_PROFILES)

      // Apply filters
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }

      if (filters?.nearby) {
        query = query.lt('distance_km', 1)
      }

      if (filters?.highTips) {
        query = query.gte('tip_amount', 40)
      }

      if (filters?.mine?.as === 'either') {
        query = query.or(`requester_id.eq.${filters.mine.userId},deliverer_id.eq.${filters.mine.userId}`)
      } else if (filters?.mine) {
        // "My orders" view: scoped to what this user posted or is delivering.
        query = query.eq(filters.mine.as === 'customer' ? 'requester_id' : 'deliverer_id', filters.mine.userId)
      } else if (!filters?.status || filters.status === 'all') {
        // Public browse feed: only show orders still open for pickup unless
        // the caller explicitly asked for a different status.
        query = query.eq('status', 'pending')
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) throw error

      // Add friend status if needed. NOTE: no friend-request/accept flow is
      // implemented anywhere in the app (see the friendships RLS review),
      // so `friendships` will realistically never have rows - this filter
      // is schema-correct but effectively always returns zero friends
      // until that feature is built.
      if (filters?.friendsOnly && filters?.viewerId) {
        const { data: friendships } = await supabase
          .from('friendships')
          .select('addressee_id')
          .eq('requester_id', filters.viewerId)

        const friendIds = friendships?.map((f: { addressee_id: string }) => f.addressee_id) || []

        const ordersData = (data ?? []) as OrderWithProfiles[]
        const friendOrders = ordersData
          .filter((order) => friendIds.includes(order.requester_id))
          .map((order) => ({ ...order, is_friend: true }))

        setOrders(friendOrders)
      } else {
        setOrders((data ?? []) as OrderWithProfiles[])
      }
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to load orders')
      console.error('Error fetching orders:', err)
      setError(message)
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  const createOrder = async (orderData: Omit<Order, 'id' | 'created_at' | 'otp'>) => {
    const validated = validateOrThrow(PostOrderSchema, orderData)

    // otp has no DB default - it's generated here at creation time. Only
    // its SELECT is locked down (see ORDER_COLUMNS above); a normal INSERT
    // including it is still allowed.
    const { data, error } = await supabase
      .from('orders')
      .insert([{
        ...validated,
        otp: Math.floor(100000 + Math.random() * 900000).toString(),
      }] as any)
      .select(ORDER_COLUMNS)

    if (error) throw error
    return data?.[0]
  }

  const acceptOrder = async (orderId: string, delivererId: string) => {
    // .eq('status', 'pending') makes this an atomic compare-and-swap:
    // if another deliverer already accepted the order, zero rows match
    // and this update is a no-op instead of overwriting their claim.
    // .neq('requester_id', delivererId) stops a requester from accepting
    // their own order.
    const { data, error } = await (supabase as any)
      .from('orders')
      .update({
        deliverer_id: delivererId,
        status: 'accepted',
      })
      .eq('id', orderId)
      .eq('status', 'pending')
      .neq('requester_id', delivererId)
      .select(ORDER_COLUMNS)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('This order was already accepted, or you cannot accept your own order')
      }
      throw error
    }
    return data
  }

  const updateOrderStatus = async (orderId: string, status: Order['status'], delivererId: string) => {
    if (status === 'delivered') {
      throw new Error('Use OTP verification to mark an order as delivered')
    }

    const { data: current, error: fetchError } = await supabase
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .eq('deliverer_id', delivererId)
      .single()

    if (fetchError || !current) {
      throw new Error('Order not found or you are not the assigned deliverer')
    }

    if (!isValidOrderStatusTransition(current.status as Order['status'], status)) {
      throw new Error(`Cannot move an order from "${current.status}" to "${status}"`)
    }

    // Scoping to deliverer_id + the status we just read prevents a user
    // from updating an order they were never assigned to, and prevents a
    // lost update if the status changed between the read above and here.
    const { data, error } = await (supabase as any)
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .eq('deliverer_id', delivererId)
      .eq('status', current.status)
      .select(ORDER_COLUMNS)

    if (error) throw error
    if (!data || data.length === 0) {
      throw new Error('Order status changed by someone else - please refresh and try again')
    }
    return data[0]
  }

  /** Requester-only: fetch the OTP for their own order, to share with the deliverer. */
  const getMyOrderOtp = async (orderId: string): Promise<string> => {
    const { data, error } = await supabase.rpc('get_my_order_otp', { p_order_id: orderId })
    if (error) throw error
    return data as unknown as string
  }

  /**
   * Deliverer-only: submit the code the requester gave them. The match
   * check and the resulting 'delivered' transition both happen inside the
   * verify_delivery_otp() DB function - this call never compares the code
   * itself, it only receives a boolean result.
   */
  const verifyDeliveryOtp = async (orderId: string, code: string): Promise<boolean> => {
    const validCode = validateOrThrow(OtpCodeSchema, code)
    const { data, error } = await supabase.rpc('verify_delivery_otp', {
      p_order_id: orderId,
      p_code: validCode,
    })
    if (error) throw error
    return Boolean(data)
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
    error,
    fetchOrders,
    createOrder,
    acceptOrder,
    updateOrderStatus,
    getMyOrderOtp,
    verifyDeliveryOtp,
    subscribeToOrders,
  }
}
