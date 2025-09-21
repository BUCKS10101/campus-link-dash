import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Header from '@/components/layout/Header'
import MobileNav from '@/components/layout/MobileNav'
import SupportChat from '@/components/support/SupportChat'
import OrderCard from '@/components/orders/OrderCard'
import { useAuth } from '@/hooks/useAuth'
import { useOrders } from '@/hooks/useOrders'
import { useToast } from '@/hooks/use-toast'
import { useNavigate } from 'react-router-dom'

const Home = () => {
  const { toast } = useToast()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { orders, loading, fetchOrders, acceptOrder, subscribeToOrders } = useOrders()
  const [activeFilter, setActiveFilter] = useState('all')

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login')
      return
    }

    if (user) {
      // Initial fetch
      fetchOrders({
        status: activeFilter === 'all' ? undefined : activeFilter,
        friendsOnly: activeFilter === 'friends',
        nearby: activeFilter === 'nearby',
        highTips: activeFilter === 'high-tips',
        userId: user.user.id
      })

      // Subscribe to real-time updates
      const unsubscribe = subscribeToOrders((payload) => {
        console.log('Order update:', payload)
        // Refetch orders when there's an update
        fetchOrders({
          status: activeFilter === 'all' ? undefined : activeFilter,
          friendsOnly: activeFilter === 'friends',
          nearby: activeFilter === 'nearby',
          highTips: activeFilter === 'high-tips',
          userId: user.user.id
        })
      })

      return unsubscribe
    }
  }, [user, authLoading, activeFilter])

  useEffect(() => {
    if (user && activeFilter) {
      fetchOrders({
        status: activeFilter === 'all' ? undefined : activeFilter,
        friendsOnly: activeFilter === 'friends',
        nearby: activeFilter === 'nearby',
        highTips: activeFilter === 'high-tips',
        userId: user.user.id
      })
    }
  }, [activeFilter, user])

  const filters = [
    { key: 'all', label: 'All Orders', count: orders.length },
    { key: 'friends', label: 'Friends', count: orders.filter(o => o.is_friend).length },
    { key: 'nearby', label: 'Nearby', count: orders.filter(o => o.distance < 1).length },
    { key: 'high-tips', label: 'High Tips', count: orders.filter(o => o.tip_amount >= 40).length }
  ]

  const handleAcceptOrder = async (orderId: string) => {
    if (!user) return
    
    try {
      await acceptOrder(orderId, user.user.id)
      
      toast({
        title: "Order Accepted!",
        description: "You can now start the delivery process."
      })
      
      // Navigate to order details
      navigate(`/my-orders`)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to accept order. Please try again.",
        variant: "destructive"
      })
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading orders...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        {/* Live Updates Indicator */}
        <div className="mb-6">
          <div className="inline-flex items-center space-x-2 bg-success/10 text-success px-3 py-1 rounded-full text-sm">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
            <span>3 new orders</span>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex space-x-2 mb-6 overflow-x-auto">
          {filters.map((filter) => (
            <Button
              key={filter.key}
              variant={activeFilter === filter.key ? "default" : "outline"}
              onClick={() => setActiveFilter(filter.key)}
              className="flex-shrink-0"
            >
              {filter.label}
              <Badge variant="secondary" className="ml-2">
                {filter.count}
              </Badge>
            </Button>
          ))}
        </div>

        {/* Orders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={{
                id: order.id,
                restaurant: { 
                  name: order.restaurant_name, 
                  icon: order.restaurant_icon 
                },
                customer: order.customer_profile?.full_name || 'Unknown',
                items: order.items_description,
                price: order.price,
                tip: order.tip_amount,
                distance: `${order.distance.toFixed(1)} km`,
                location: `${order.pickup_location} to ${order.delivery_location}`,
                timeAgo: new Date(order.created_at).toLocaleString('en-US', {
                  hour: 'numeric',
                  minute: 'numeric',
                  hour12: true
                }),
                isFriend: order.is_friend
              }}
              onAccept={handleAcceptOrder}
            />
          ))}
        </div>

        {orders.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No orders found for the selected filter.</p>
          </div>
        )}
      </main>

      <MobileNav />
      <SupportChat />
    </div>
  )
}

export default Home