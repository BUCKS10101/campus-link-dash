import React from 'react'
import { Home, Plus, Package, User } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

const MobileNav = () => {
  const location = useLocation()

  const navItems = [
    { icon: Home, label: 'Home', href: '/' },
    { icon: Plus, label: 'Post', href: '/post-request' },
    { icon: Package, label: 'Orders', href: '/my-orders' },
    { icon: User, label: 'Profile', href: '/profile' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t md:hidden">
      <div className="grid h-16 max-w-lg grid-cols-4 mx-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href
          const Icon = item.icon
          
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "inline-flex flex-col items-center justify-center px-5 py-2 text-xs transition-colors",
                isActive 
                  ? "text-primary bg-primary/10" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-5 h-5 mb-1" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export default MobileNav