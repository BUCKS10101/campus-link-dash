import React, { useState } from 'react'
import { MessageCircle, MapPin, Clock, User, CheckCircle2, Package, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import Header from '@/components/layout/Header'
import MobileNav from '@/components/layout/MobileNav'
import SupportChat from '@/components/support/SupportChat'

const MyOrders = () => {
  const [activeOrder] = useState('order-1')
  const [message, setMessage] = useState('')
  const [chatMessages, setChatMessages] = useState([
    {
      id: 1,
      sender: 'deliverer',
      name: 'Arjun',
      text: "Hi! I'm Arjun, I've accepted your order 👍",
      timestamp: '2 min ago'
    },
    {
      id: 2,
      sender: 'deliverer',
      name: 'Arjun',
      text: "My contact: +91-9876543210",
      timestamp: '2 min ago'
    },
    {
      id: 3,
      sender: 'deliverer',
      name: 'Arjun',
      text: "Heading to One Food now! ETA 15 mins",
      timestamp: '1 min ago'
    }
  ])
  const [otp, setOtp] = useState(['', '', '', '', '', ''])

  const orderStatuses = [
    { status: 'pending', label: 'Pending', icon: Clock, completed: true },
    { status: 'accepted', label: 'Accepted', icon: CheckCircle2, completed: true },
    { status: 'picked-up', label: 'Picked Up', icon: Package, completed: true },
    { status: 'out-for-delivery', label: 'Out for Delivery', icon: Truck, completed: false },
    { status: 'delivered', label: 'Delivered', icon: CheckCircle2, completed: false }
  ]

  const currentOrder = {
    id: 'order-1',
    restaurant: { name: 'One Food', icon: '🍔' },
    items: '2x Chicken Burger + 1x Large Fries',
    price: 240,
    tip: 35,
    deliverer: {
      name: 'Arjun Kumar',
      phone: '+91-9876543210',
      rating: 4.8
    },
    status: 'picked-up',
    location: 'Hostel K Block',
    estimatedTime: '15 mins'
  }

  const handleSendMessage = () => {
    if (!message.trim()) return

    const newMessage = {
      id: chatMessages.length + 1,
      sender: 'customer',
      name: 'You',
      text: message,
      timestamp: 'just now'
    }

    setChatMessages([...chatMessages, newMessage])
    setMessage('')
  }

  const handleOtpChange = (index: number, value: string) => {
    if (value.length <= 1) {
      const newOtp = [...otp]
      newOtp[index] = value
      setOtp(newOtp)
      
      if (value && index < 5) {
        const nextInput = document.getElementById(`delivery-otp-${index + 1}`)
        nextInput?.focus()
      }
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        <div className="max-w-6xl mx-auto">
          {/* Desktop Layout */}
          <div className="hidden md:grid md:grid-cols-2 gap-6">
            {/* Order Info */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <span className="text-2xl">{currentOrder.restaurant.icon}</span>
                    <span>{currentOrder.restaurant.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="font-medium">{currentOrder.items}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-lg font-semibold">₹{currentOrder.price}</span>
                      <Badge className="tip-badge">₹{currentOrder.tip} tip</Badge>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {currentOrder.deliverer.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{currentOrder.deliverer.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {currentOrder.deliverer.rating} ⭐ • {currentOrder.deliverer.phone}
                      </p>
                    </div>
                  </div>

                  {/* Order Status Timeline */}
                  <div className="space-y-3">
                    <h3 className="font-semibold">Order Status</h3>
                    <div className="space-y-2">
                      {orderStatuses.map((status, index) => {
                        const Icon = status.icon
                        const isCompleted = status.completed
                        const isCurrent = currentOrder.status === status.status
                        
                        return (
                          <div key={status.status} className="flex items-center space-x-3">
                            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                              isCompleted 
                                ? 'bg-success text-success-foreground' 
                                : isCurrent 
                                ? 'bg-primary text-primary-foreground animate-pulse'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <span className={`${isCompleted || isCurrent ? 'font-medium' : 'text-muted-foreground'}`}>
                              {status.label}
                            </span>
                            {isCurrent && (
                              <Badge variant="outline" className="ml-auto">Current</Badge>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* OTP Section */}
                  <div className="space-y-3">
                    <h3 className="font-semibold">Delivery OTP</h3>
                    <p className="text-sm text-muted-foreground">
                      Share this OTP with your deliverer upon receiving your order
                    </p>
                    <div className="flex justify-center space-x-2">
                      {otp.map((digit, index) => (
                        <Input
                          key={index}
                          id={`delivery-otp-${index}`}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpChange(index, e.target.value)}
                          className="w-10 h-10 text-center text-lg font-semibold"
                          readOnly
                        />
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Map */}
              <Card>
                <CardContent className="p-0">
                  <div className="h-64 bg-muted rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <MapPin className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-muted-foreground">Live tracking map</p>
                      <p className="text-sm text-muted-foreground">
                        Deliverer location: Near {currentOrder.restaurant.name}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Chat */}
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <MessageCircle className="h-5 w-5" />
                  <span>Chat with Deliverer</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Messages */}
                <div className="h-64 overflow-y-auto space-y-3 p-3 bg-muted/20 rounded-lg">
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender === 'customer' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] p-2 rounded-lg ${
                          msg.sender === 'customer'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-card text-card-foreground border'
                        }`}
                      >
                        <p className="text-sm">{msg.text}</p>
                        <p className="text-xs opacity-70 mt-1">{msg.timestamp}</p>
                      </div>
                    </div>
                  ))}
                  
                  {/* Typing Indicator */}
                  <div className="flex justify-start">
                    <div className="bg-card text-card-foreground border p-2 rounded-lg">
                      <p className="text-sm text-muted-foreground">Arjun is typing...</p>
                    </div>
                  </div>
                </div>

                {/* Message Input */}
                <div className="flex space-x-2">
                  <Input
                    placeholder="Type your message..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                  <Button onClick={handleSendMessage}>Send</Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Mobile Layout */}
          <div className="md:hidden">
            <Tabs defaultValue="order" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="order">Order Info</TabsTrigger>
                <TabsTrigger value="chat">Chat</TabsTrigger>
                <TabsTrigger value="track">Track</TabsTrigger>
              </TabsList>

              <TabsContent value="order" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <span className="text-2xl">{currentOrder.restaurant.icon}</span>
                      <span>{currentOrder.restaurant.name}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="font-medium">{currentOrder.items}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-lg font-semibold">₹{currentOrder.price}</span>
                        <Badge className="tip-badge">₹{currentOrder.tip} tip</Badge>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {currentOrder.deliverer.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{currentOrder.deliverer.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {currentOrder.deliverer.rating} ⭐ • {currentOrder.deliverer.phone}
                        </p>
                      </div>
                    </div>

                    {/* Order Status Timeline */}
                    <div className="space-y-3">
                      <h3 className="font-semibold">Order Status</h3>
                      <div className="space-y-2">
                        {orderStatuses.map((status, index) => {
                          const Icon = status.icon
                          const isCompleted = status.completed
                          const isCurrent = currentOrder.status === status.status
                          
                          return (
                            <div key={status.status} className="flex items-center space-x-3">
                              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                                isCompleted 
                                  ? 'bg-success text-success-foreground' 
                                  : isCurrent 
                                  ? 'bg-primary text-primary-foreground animate-pulse'
                                  : 'bg-muted text-muted-foreground'
                              }`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <span className={`${isCompleted || isCurrent ? 'font-medium' : 'text-muted-foreground'}`}>
                                {status.label}
                              </span>
                              {isCurrent && (
                                <Badge variant="outline" className="ml-auto">Current</Badge>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="chat" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <MessageCircle className="h-5 w-5" />
                      <span>Chat with Deliverer</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Messages */}
                    <div className="h-64 overflow-y-auto space-y-3 p-3 bg-muted/20 rounded-lg">
                      {chatMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.sender === 'customer' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] p-2 rounded-lg ${
                              msg.sender === 'customer'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-card text-card-foreground border'
                            }`}
                          >
                            <p className="text-sm">{msg.text}</p>
                            <p className="text-xs opacity-70 mt-1">{msg.timestamp}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Message Input */}
                    <div className="flex space-x-2">
                      <Input
                        placeholder="Type your message..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      />
                      <Button onClick={handleSendMessage}>Send</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="track" className="space-y-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="h-64 bg-muted rounded-lg flex items-center justify-center mb-4">
                      <div className="text-center">
                        <MapPin className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-muted-foreground">Live tracking map</p>
                        <p className="text-sm text-muted-foreground">
                          Deliverer location: Near {currentOrder.restaurant.name}
                        </p>
                      </div>
                    </div>

                    {/* OTP Section */}
                    <div className="space-y-3">
                      <h3 className="font-semibold">Delivery OTP</h3>
                      <p className="text-sm text-muted-foreground">
                        Share this OTP with your deliverer upon receiving your order
                      </p>
                      <div className="flex justify-center space-x-2">
                        {['1', '2', '3', '4', '5', '6'].map((digit, index) => (
                          <div
                            key={index}
                            className="w-10 h-10 flex items-center justify-center bg-primary text-primary-foreground rounded-md text-lg font-semibold"
                          >
                            {Math.floor(Math.random() * 10)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      <MobileNav />
      <SupportChat />
    </div>
  )
}

export default MyOrders