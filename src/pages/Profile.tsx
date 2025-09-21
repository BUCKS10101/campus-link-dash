import React from 'react'
import { Trophy, Star, Wallet, Users, Package, Clock, MapPin, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import Header from '@/components/layout/Header'
import MobileNav from '@/components/layout/MobileNav'
import SupportChat from '@/components/support/SupportChat'

const Profile = () => {
  const userStats = [
    { icon: Package, label: 'Successful Deliveries', value: '27', color: 'text-success' },
    { icon: Star, label: 'Average Rating', value: '4.8 ⭐', color: 'text-amber-500' },
    { icon: Wallet, label: 'Current Balance', value: '₹350', color: 'text-primary' },
    { icon: Users, label: 'Friend Network', value: '23 connections', color: 'text-accent' }
  ]

  const orderHistory = [
    { id: '1', restaurant: { name: 'One Food', icon: '🍔' }, items: '2x Burger + Fries', amount: 240, date: '2 days ago', status: 'Delivered' },
    { id: '2', restaurant: { name: 'DC Cafe', icon: '☕' }, items: '1x Coffee + Sandwich', amount: 180, date: '3 days ago', status: 'Delivered' },
    { id: '3', restaurant: { name: 'Campus Store', icon: '🛒' }, items: 'Stationery Items', amount: 320, date: '5 days ago', status: 'Delivered' },
    { id: '4', restaurant: { name: 'One Food', icon: '🍔' }, items: '1x Pizza', amount: 450, date: '1 week ago', status: 'Delivered' },
    { id: '5', restaurant: { name: 'DC Cafe', icon: '☕' }, items: '2x Tea + Snacks', amount: 120, date: '1 week ago', status: 'Delivered' }
  ]

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* User Header */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-6">
                <Avatar className="h-20 w-20">
                  <AvatarImage src="/avatars/user.png" alt="User" />
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl">G</AvatarFallback>
                </Avatar>
                
                <div className="text-center md:text-left flex-1">
                  <h1 className="text-2xl font-bold">Govind</h1>
                  <p className="text-muted-foreground">VIT Student Since 2023</p>
                  <p className="text-sm text-muted-foreground">+91-7736359996</p>
                  <Badge className="mt-2" variant="secondary">Active Member</Badge>
                </div>

                <Button className="btn-campus-primary">
                  Become a Deliverer
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {userStats.map((stat, index) => {
              const Icon = stat.icon
              return (
                <Card key={index}>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-3">
                      <div className={`${stat.color}`}>
                        <Icon className="h-8 w-8" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{stat.value}</p>
                        <p className="text-sm text-muted-foreground">{stat.label}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Order History */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Clock className="h-5 w-5" />
                  <span>Recent Orders</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Restaurant</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderHistory.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">{order.restaurant.icon}</span>
                            <span className="font-medium">{order.restaurant.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{order.items}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">₹{order.amount}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{order.date}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-success border-success">
                            {order.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Settings Panel */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="h-5 w-5" />
                  <span>Settings</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Theme Toggle */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Dark Mode</Label>
                    <p className="text-sm text-muted-foreground">Toggle dark/light theme</p>
                  </div>
                  <Switch />
                </div>

                {/* Notifications */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Push Notifications</Label>
                    <p className="text-sm text-muted-foreground">Get notified about new orders</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                {/* Location Sharing */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Location Sharing</Label>
                    <p className="text-sm text-muted-foreground">Share location with deliverers</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                {/* Friend Requests */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Friend Requests</Label>
                    <p className="text-sm text-muted-foreground">Allow friend requests</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="pt-4 space-y-2">
                  <Button variant="outline" className="w-full">
                    Edit Profile
                  </Button>
                  <Button variant="outline" className="w-full">
                    Privacy Settings
                  </Button>
                  <Button variant="outline" className="w-full">
                    Help & Support
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Achievement Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                <span>Achievements</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center space-x-3 p-4 bg-success/10 rounded-lg">
                  <Trophy className="h-8 w-8 text-success" />
                  <div>
                    <p className="font-semibold">First Order</p>
                    <p className="text-sm text-muted-foreground">Completed your first delivery</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3 p-4 bg-primary/10 rounded-lg">
                  <Star className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-semibold">5-Star Deliverer</p>
                    <p className="text-sm text-muted-foreground">Maintained 4.5+ rating</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3 p-4 bg-accent/10 rounded-lg">
                  <Users className="h-8 w-8 text-accent-foreground" />
                  <div>
                    <p className="font-semibold">Social Butterfly</p>
                    <p className="text-sm text-muted-foreground">Connected with 20+ friends</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <MobileNav />
      <SupportChat />
    </div>
  )
}

export default Profile