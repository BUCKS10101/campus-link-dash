import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Header from '@/components/layout/Header'
import MobileNav from '@/components/layout/MobileNav'
import SupportChat from '@/components/support/SupportChat'
import OrderCard from '@/components/orders/OrderCard'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'

const Home = () => {
  const { toast } = useToast()
  const [activeFilter, setActiveFilter] = useState('all')
  const [orders, setOrders] = useState([
    {
      id: '1',
      restaurant: { name: 'One Food', icon: '🍔' },
      customer: 'Arjun Kumar',
      items: '2x Chicken Burger + 1x Fries',
      price: 240,
      tip: 35,
      distance: '0.8 km',
      location: 'Hostel K Block to Central Library',
      timeAgo: '2 min ago',
      isFriend: true
    },
    {
      id: '2',
      restaurant: { name: 'DC Cafe', icon: '☕' },
      customer: 'Priya Sharma',
      items: '1x Cappuccino + 2x Sandwich',
      price: 180,
      tip: 25,
      distance: '1.2 km',
      location: 'Ladies Hostel M to TT Block',
      timeAgo: '5 min ago'
    },
    {
      id: '3',
      restaurant: { name: 'Campus Store', icon: '🛒' },
      customer: 'Rahul Verma',
      items: 'Notebooks + Pens + Snacks',
      price: 350,
      tip: 40,
      distance: '0.5 km',
      location: 'Hostel A to SMV',
      timeAgo: '8 min ago',
      isFriend: true
    },
    {
      id: '4',
      restaurant: { name: 'One Food', icon: '🍔' },
      customer: 'Ananya Patel',
      items: '1x Veg Pizza + 1x Coke',
      price: 290,
      tip: 30,
      distance: '1.5 km',
      location: 'Hostel Q to SJT Block',
      timeAgo: '10 min ago'
    },
    {
      id: '5',
      restaurant: { name: 'DC Cafe', icon: '☕' },
      customer: 'Sneha Reddy',
      items: '2x Cold Coffee + 1x Pastry',
      price: 220,
      tip: 45,
      distance: '0.7 km',
      location: 'Ladies Hostel D to GDN',
      timeAgo: '12 min ago',
      isFriend: true
    },
    {
      id: '6',
      restaurant: { name: 'Campus Store', icon: '🛒' },
      customer: 'Vikram Singh',
      items: 'Lab Manual + Calculator',
      price: 450,
      tip: 50,
      distance: '1.0 km',
      location: 'Hostel J to MB',
      timeAgo: '15 min ago'
    },
    {
      id: '7',
      restaurant: { name: 'One Food', icon: '🍔' },
      customer: 'Neha Gupta',
      items: '3x Wraps + 2x Juice',
      price: 380,
      tip: 35,
      distance: '0.9 km',
      location: 'Hostel B to PRP',
      timeAgo: '18 min ago',
      isFriend: true
    },
    {
      id: '8',
      restaurant: { name: 'DC Cafe', icon: '☕' },
      customer: 'Amit Joshi',
      items: '1x Tea + 2x Cookies',
      price: 80,
      tip: 20,
      distance: '0.3 km',
      location: 'Hostel C to Library',
      timeAgo: '20 min ago'
    }
  ])

  const filters = [
    { key: 'all', label: 'All Orders', count: orders.length },
    { key: 'friends', label: 'Friends', count: orders.filter(o => o.isFriend).length },
    { key: 'nearby', label: 'Nearby', count: orders.filter(o => parseFloat(o.distance) < 1).length },
    { key: 'high-tips', label: 'High Tips', count: orders.filter(o => o.tip >= 40).length }
  ]

  const getFilteredOrders = () => {
    switch (activeFilter) {
      case 'friends':
        return orders.filter(order => order.isFriend)
      case 'nearby':
        return orders.filter(order => parseFloat(order.distance) < 1)
      case 'high-tips':
        return orders.filter(order => order.tip >= 40)
      default:
        return orders
    }
  }

  const handleAcceptOrder = async (orderId: string) => {
    try {
      // TODO: Implement order acceptance with Supabase
      toast({
        title: "Order Accepted!",
        description: "You can now start the delivery process."
      })
      
      // Remove the accepted order from the list
      setOrders(prev => prev.filter(order => order.id !== orderId))
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to accept order. Please try again.",
        variant: "destructive"
      })
    }
  }

  const filteredOrders = getFilteredOrders()

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
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onAccept={handleAcceptOrder}
            />
          ))}
        </div>

        {filteredOrders.length === 0 && (
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