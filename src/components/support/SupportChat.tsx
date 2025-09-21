import React, { useState } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const SupportChat = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Hi! I'm CampusLink Assistant. How can I help you today?",
      isBot: true,
      timestamp: new Date()
    }
  ])

  const quickActions = [
    { text: "My order is stuck", response: "Let me check nearby deliverers for your order..." },
    { text: "Payment failed", response: "I'll help you troubleshoot payment issues. Please try these steps..." },
    { text: "Wrong location", response: "I'll help you report this location issue to our support team." }
  ]

  const handleQuickAction = (action: typeof quickActions[0]) => {
    const newMessages = [
      ...messages,
      {
        id: messages.length + 1,
        text: action.text,
        isBot: false,
        timestamp: new Date()
      },
      {
        id: messages.length + 2,
        text: action.response,
        isBot: true,
        timestamp: new Date()
      }
    ]
    setMessages(newMessages)
  }

  const handleSendMessage = () => {
    if (!message.trim()) return

    const newMessages = [
      ...messages,
      {
        id: messages.length + 1,
        text: message,
        isBot: false,
        timestamp: new Date()
      },
      {
        id: messages.length + 2,
        text: "Thank you for your message. A support agent will respond shortly.",
        isBot: true,
        timestamp: new Date()
      }
    ]
    setMessages(newMessages)
    setMessage('')
  }

  return (
    <>
      {/* Chat Bubble */}
      <Button
        onClick={() => setIsOpen(true)}
        size="icon"
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 h-12 w-12 rounded-full shadow-lg z-40"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>

      {/* Chat Panel */}
      {isOpen && (
        <Card className="fixed bottom-20 right-4 md:bottom-20 md:right-6 w-[calc(100vw-2rem)] md:w-80 h-96 z-50 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Support Chat</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="h-6 w-6"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          
          <CardContent className="flex flex-col h-full p-4">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.isBot ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[80%] p-2 rounded-lg text-sm ${
                      msg.isBot
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Actions */}
            {messages.length === 1 && (
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-2">Quick actions:</p>
                <div className="flex flex-wrap gap-1">
                  {quickActions.map((action, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="cursor-pointer hover:bg-secondary/80 text-xs"
                      onClick={() => handleQuickAction(action)}
                    >
                      {action.text}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Message Input */}
            <div className="flex gap-2">
              <Input
                placeholder="Type your message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                className="flex-1"
              />
              <Button size="icon" onClick={handleSendMessage}>
                <Send className="h-4 w-4" />
              </Button>
            </div>

            {/* Human Support */}
            <Button
              variant="link"
              size="sm"
              className="mt-2 text-xs text-muted-foreground"
            >
              Chat with human support
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  )
}

export default SupportChat