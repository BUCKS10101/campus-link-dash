import React from 'react'
import { Clock, MapPin, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

interface OrderCardProps {
  order: {
    id: string
    restaurant: {
      name: string
      icon: string
    }
    customer: string
    items: string
    price: number
    tip: number
    distance: string
    location: string
    timeAgo: string
    isFriend?: boolean
  }
  onAccept: (orderId: string) => void
}

const OrderCard: React.FC<OrderCardProps> = ({ order, onAccept }) => {
  return (
    <Card className="order-card">
      <CardContent className="p-4">
        {/* Header with Restaurant and Friend Badge */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">{order.restaurant.icon}</span>
            <div>
              <h3 className="font-semibold text-foreground">{order.restaurant.name}</h3>
              <p className="text-sm text-muted-foreground">{order.customer}</p>
            </div>
          </div>
          {order.isFriend && (
            <Badge className="friend-badge">
              <Star className="h-3 w-3 mr-1" />
              FRIEND
            </Badge>
          )}
        </div>

        {/* Order Details */}
        <div className="space-y-2 mb-4">
          <p className="text-sm font-medium">{order.items}</p>
          <div className="flex items-center justify-between">
            <span className="font-semibold">₹{order.price}</span>
            <Badge className="tip-badge">
              ₹{order.tip} tip
            </Badge>
          </div>
        </div>

        {/* Location and Time */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 mr-1" />
            <span>{order.distance} • {order.location}</span>
          </div>
          <div className="flex items-center text-sm text-muted-foreground">
            <Clock className="h-4 w-4 mr-1" />
            <span>{order.timeAgo}</span>
          </div>
        </div>

        {/* Accept Button */}
        <Button 
          onClick={() => onAccept(order.id)}
          className="w-full btn-campus-primary"
        >
          Accept Order
        </Button>
      </CardContent>
    </Card>
  )
}

export default OrderCard