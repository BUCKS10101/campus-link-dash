import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

/**
 * Phase 3J - see PHASE3_3J_TRUST_SAFETY_SPEC.md §2. An unverified user
 * has a real, valid session - they are NOT sent to /login. Per the
 * spec's explicit product decision, verification is an action-allowlist,
 * not a hard wall: browsing Home, Activity, Profile, Friends, Settings,
 * and Insights all remain reachable while unverified (each of those
 * pages' own gated *actions* - Take, send, Add - show their own inline
 * "verify your email" message on attempt, per the spec's UX design §8,
 * not a route-level redirect). The one route excluded from this
 * allowlist is /post-request: its entire purpose is the one action 3J
 * blocks outright (posting), so redirecting away from it here - rather
 * than letting an unverified user fill out the whole form only to have
 * every submit rejected - is the one place a route-level gate is the
 * more honest UX. The real, un-bypassable boundary is server-side
 * (RLS/triggers) either way - this is a UX courtesy on top of it, same
 * as every other client-side gate in this app.
 */
const ROUTES_BLOCKED_WHILE_UNVERIFIED = ['/post-request']

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
      </div>
    )
  }

  if (!user?.user) {
    return <Navigate to="/login" replace />
  }

  if (!user.emailVerified && ROUTES_BLOCKED_WHILE_UNVERIFIED.includes(location.pathname)) {
    return <Navigate to="/verify-email" replace />
  }

  return <>{children}</>
}

export default ProtectedRoute
