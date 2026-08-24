import React, { useEffect, useMemo, useState } from 'react'
import { MessageCircle, Clock, CheckCircle2, Package, Truck, AlertCircle, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import Header from '@/components/layout/Header'
import MobileNav from '@/components/layout/MobileNav'
import SupportChat from '@/components/support/SupportChat'
import { useAuth } from '@/hooks/useAuth'
import { useOrders } from '@/hooks/useOrders'
import { useChat } from '@/hooks/useChat'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/utils'
import { getRestaurantIcon, formatOrderItems, formatDeliveryLocation } from '@/lib/orderContent'
import type { OrderWithProfiles, Order } from '@/lib/database-types'

const STATUS_STEPS: { status: Order['status']; label: string; icon: typeof Clock }[] = [
  { status: 'pending', label: 'Pending', icon: Clock },
  { status: 'accepted', label: 'Accepted', icon: CheckCircle2 },
  { status: 'picked_up', label: 'Picked Up', icon: Package },
  { status: 'out_for_delivery', label: 'Out for Delivery', icon: Truck },
  { status: 'delivered', label: 'Delivered', icon: CheckCircle2 },
]

const TERMINAL_STATUSES: Order['status'][] = ['delivered', 'cancelled']

const NEXT_DELIVERER_ACTION: Partial<Record<Order['status'], { label: string; next: Order['status'] }>> = {
  accepted: { label: 'Mark Picked Up', next: 'picked_up' },
  picked_up: { label: 'Mark Out for Delivery', next: 'out_for_delivery' },
}

const OrderStatusTimeline = ({ status }: { status: Order['status'] }) => {
  const currentIndex = STATUS_STEPS.findIndex((s) => s.status === status)
  return (
    <div className="space-y-2">
      {STATUS_STEPS.map((step, index) => {
        const Icon = step.icon
        const isCompleted = status !== 'cancelled' && index < currentIndex
        const isCurrent = step.status === status
        return (
          <div key={step.status} className="flex items-center space-x-3">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
              isCompleted
                ? 'bg-success text-success-foreground'
                : isCurrent
                ? 'bg-primary text-primary-foreground animate-pulse'
                : 'bg-muted text-muted-foreground'
            }`}>
              <Icon className="h-4 w-4" />
            </div>
            <span className={isCompleted || isCurrent ? 'font-medium' : 'text-muted-foreground'}>
              {step.label}
            </span>
            {isCurrent && <Badge variant="outline" className="ml-auto">Current</Badge>}
          </div>
        )
      })}
      {status === 'cancelled' && (
        <Badge variant="destructive">Cancelled</Badge>
      )}
    </div>
  )
}

const OtpPanel = ({
  order,
  isCustomer,
  isDeliverer,
  getMyOrderOtp,
  verifyDeliveryOtp,
  onVerified,
}: {
  order: OrderWithProfiles
  isCustomer: boolean
  isDeliverer: boolean
  getMyOrderOtp: (orderId: string) => Promise<string>
  verifyDeliveryOtp: (orderId: string, code: string) => Promise<boolean>
  onVerified: () => void
}) => {
  const { toast } = useToast()
  const [otp, setOtp] = useState<string | null>(null)
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError] = useState<string | null>(null)
  const [inputCode, setInputCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  const otpEligible = order.status === 'picked_up' || order.status === 'out_for_delivery'

  useEffect(() => {
    if (!isCustomer || !otpEligible) return
    let cancelled = false
    setOtpLoading(true)
    setOtpError(null)
    getMyOrderOtp(order.id)
      .then((code) => { if (!cancelled) setOtp(code) })
      .catch((err) => { if (!cancelled) setOtpError(getErrorMessage(err, 'Failed to load OTP')) })
      .finally(() => { if (!cancelled) setOtpLoading(false) })
    return () => { cancelled = true }
  }, [isCustomer, otpEligible, order.id, order.status])

  if (!otpEligible) return null

  if (isCustomer) {
    return (
      <div className="space-y-3">
        <h3 className="font-semibold">Delivery OTP</h3>
        <p className="text-sm text-muted-foreground">
          Share this code with your deliverer when they arrive - it confirms the delivery.
        </p>
        {otpLoading && (
          <div className="flex justify-center space-x-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="w-10 h-10" />)}
          </div>
        )}
        {otpError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{otpError}</AlertDescription>
          </Alert>
        )}
        {!otpLoading && !otpError && otp && (
          <div className="flex justify-center space-x-2">
            {otp.split('').map((digit, index) => (
              <div key={index} className="w-10 h-10 flex items-center justify-center bg-primary text-primary-foreground rounded-md text-lg font-semibold">
                {digit}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (isDeliverer) {
    const handleVerify = async () => {
      setVerifying(true)
      setVerifyError(null)
      try {
        const success = await verifyDeliveryOtp(order.id, inputCode)
        if (success) {
          toast({ title: 'Delivery confirmed!', description: 'The order has been marked as delivered.' })
          setInputCode('')
          onVerified()
        } else {
          setVerifyError('Incorrect code. Ask the customer to confirm and try again.')
        }
      } catch (err) {
        setVerifyError(getErrorMessage(err, 'Verification failed'))
      } finally {
        setVerifying(false)
      }
    }

    return (
      <div className="space-y-3">
        <h3 className="font-semibold flex items-center space-x-2">
          <ShieldCheck className="h-4 w-4" />
          <span>Confirm Delivery</span>
        </h3>
        <p className="text-sm text-muted-foreground">
          Ask the customer for their 6-digit code and enter it below.
        </p>
        <div className="flex justify-center">
          <Input
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ''))}
            className="w-40 text-center text-lg font-semibold tracking-widest"
          />
        </div>
        {verifyError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{verifyError}</AlertDescription>
          </Alert>
        )}
        <Button
          onClick={handleVerify}
          disabled={verifying || inputCode.length !== 6}
          className="w-full btn-campus-primary"
        >
          {verifying ? 'Verifying...' : 'Verify & Complete Delivery'}
        </Button>
      </div>
    )
  }

  return null
}

const ChatPanel = ({ orderId, senderId }: { orderId: string; senderId: string }) => {
  const { messages, loading, error, sendMessage } = useChat(orderId)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!message.trim() || sending) return
    setSending(true)
    try {
      await sendMessage(message, senderId)
      setMessage('')
    } catch {
      // swallow - the input keeps the draft so the user can retry
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <MessageCircle className="h-5 w-5" />
          <span>Chat</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-64 overflow-y-auto space-y-3 p-3 bg-muted/20 rounded-lg">
          {loading && <p className="text-sm text-muted-foreground text-center">Loading messages...</p>}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!loading && !error && messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center">No messages yet. Say hello!</p>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender_id === senderId ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-2 rounded-lg ${
                msg.sender_id === senderId
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-card-foreground border'
              }`}>
                <p className="text-sm">{msg.message}</p>
                <p className="text-xs opacity-70 mt-1">
                  {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric' })}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex space-x-2">
          <Input
            placeholder="Type your message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            maxLength={1000}
          />
          <Button onClick={handleSend} disabled={sending || !message.trim()}>Send</Button>
        </div>
      </CardContent>
    </Card>
  )
}

const MyOrders = () => {
  const { toast } = useToast()
  const { user, loading: authLoading } = useAuth()
  const { orders, loading, error, fetchOrders, updateOrderStatus, getMyOrderOtp, verifyDeliveryOtp } = useOrders()

  useEffect(() => {
    if (user) {
      fetchOrders({ mine: { as: 'either', userId: user.user.id } })
    }
  }, [user])

  const refetch = () => {
    if (user) fetchOrders({ mine: { as: 'either', userId: user.user.id } })
  }

  const { activeOrder, pastOrders } = useMemo(() => {
    const active = orders.find((o) => !TERMINAL_STATUSES.includes(o.status))
    const past = orders.filter((o) => o !== active)
    return { activeOrder: active, pastOrders: past }
  }, [orders])

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
          <div className="max-w-6xl mx-auto space-y-6">
            <Skeleton className="h-96 w-full" />
          </div>
        </main>
        <MobileNav />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
          <div className="max-w-2xl mx-auto">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Couldn't load your orders</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button className="mt-4" onClick={refetch}>Try Again</Button>
          </div>
        </main>
        <MobileNav />
      </div>
    )
  }

  if (!user) return null

  if (!activeOrder && pastOrders.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
          <div className="max-w-2xl mx-auto text-center py-16 space-y-3">
            <Package className="h-10 w-10 mx-auto text-muted-foreground" />
            <h2 className="text-lg font-semibold">No orders yet</h2>
            <p className="text-muted-foreground">Post a request or accept an order from the home feed to see it here.</p>
          </div>
        </main>
        <MobileNav />
        <SupportChat />
      </div>
    )
  }

  const isCustomer = activeOrder ? activeOrder.requester_id === user.user.id : false
  const isDeliverer = activeOrder ? activeOrder.deliverer_id === user.user.id : false
  const counterpartyProfile = activeOrder
    ? (isCustomer ? activeOrder.deliverer_profile : activeOrder.requester_profile)
    : null
  const nextAction = activeOrder ? NEXT_DELIVERER_ACTION[activeOrder.status] : undefined

  const handleAdvanceStatus = async () => {
    if (!activeOrder || !nextAction) return
    try {
      await updateOrderStatus(activeOrder.id, nextAction.next, user.user.id)
      toast({ title: 'Order updated', description: `Status changed to ${nextAction.next.replace(/_/g, ' ')}` })
      refetch()
    } catch (err) {
      toast({
        title: 'Could not update order',
        description: getErrorMessage(err, 'Please try again.'),
        variant: 'destructive',
      })
    }
  }

  const orderInfoCard = activeOrder && (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <span className="text-2xl">{getRestaurantIcon(activeOrder.restaurant_name)}</span>
          <span>{activeOrder.restaurant_name}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="font-medium">{formatOrderItems(activeOrder.items)}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatDeliveryLocation(activeOrder.delivery_location)}</p>
          <div className="flex items-center justify-end mt-2">
            <Badge className="tip-badge">₹{activeOrder.tip_amount} tip</Badge>
          </div>
        </div>

        {counterpartyProfile && (
          <div className="flex items-center space-x-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {(counterpartyProfile.name || '?').charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{counterpartyProfile.name || 'Unknown'}</p>
              <p className="text-sm text-muted-foreground">
                {isCustomer ? counterpartyProfile.phone || 'No phone shared' : counterpartyProfile.phone}
              </p>
            </div>
          </div>
        )}
        {isCustomer && !activeOrder.deliverer_id && (
          <p className="text-sm text-muted-foreground">Waiting for a deliverer to accept your order...</p>
        )}

        <div className="space-y-3">
          <h3 className="font-semibold">Order Status</h3>
          <OrderStatusTimeline status={activeOrder.status} />
        </div>

        {isDeliverer && nextAction && (
          <Button onClick={handleAdvanceStatus} className="w-full btn-campus-primary">
            {nextAction.label}
          </Button>
        )}

        <OtpPanel
          order={activeOrder}
          isCustomer={isCustomer}
          isDeliverer={isDeliverer}
          getMyOrderOtp={getMyOrderOtp}
          verifyDeliveryOtp={verifyDeliveryOtp}
          onVerified={refetch}
        />
      </CardContent>
    </Card>
  )

  const historyCard = (
    <Card>
      <CardHeader>
        <CardTitle>Past Orders</CardTitle>
      </CardHeader>
      <CardContent>
        {pastOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No past orders yet.</p>
        ) : (
          <div className="space-y-3">
            {pastOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div className="flex items-center space-x-2">
                  <span className="text-lg">{getRestaurantIcon(order.restaurant_name)}</span>
                  <div>
                    <p className="font-medium text-sm">{order.restaurant_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Badge variant={order.status === 'delivered' ? 'outline' : 'destructive'}>
                  {order.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        <div className="max-w-6xl mx-auto">
          {/* Desktop Layout */}
          <div className="hidden md:grid md:grid-cols-2 gap-6">
            <div className="space-y-6">
              {orderInfoCard}
              {historyCard}
            </div>

            {activeOrder ? (
              <ChatPanel
                orderId={activeOrder.id}
                senderId={user.user.id}
              />
            ) : (
              <Card className="h-fit">
                <CardContent className="p-6 text-center text-muted-foreground">
                  No active order to chat about right now.
                </CardContent>
              </Card>
            )}
          </div>

          {/* Mobile Layout */}
          <div className="md:hidden">
            <Tabs defaultValue="order" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="order">Order Info</TabsTrigger>
                <TabsTrigger value="chat">Chat</TabsTrigger>
              </TabsList>

              <TabsContent value="order" className="space-y-4">
                {orderInfoCard}
                {historyCard}
              </TabsContent>

              <TabsContent value="chat" className="space-y-4">
                {activeOrder ? (
                  <ChatPanel
                    orderId={activeOrder.id}
                    senderId={user.user.id}
                  />
                ) : (
                  <Card>
                    <CardContent className="p-6 text-center text-muted-foreground">
                      No active order to chat about right now.
                    </CardContent>
                  </Card>
                )}
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
