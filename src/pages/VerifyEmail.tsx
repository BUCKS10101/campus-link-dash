import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Text, Rule } from '@/components/primitives'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/utils'

const RESEND_COOLDOWN_SECONDS = 60

/**
 * Phase 3J - see PHASE3_3J_TRUST_SAFETY_SPEC.md §2/§8. Rides entirely on
 * Supabase's own email-confirmation mechanism - no custom token/secret
 * system. "We sent a link, click it, resend if needed" - the first
 * "check your email" UI pattern in this codebase (confirmed by the spec's
 * audit: no resend/forgot-password flow existed anywhere before this).
 */
const VerifyEmail = () => {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const [cooldown, setCooldown] = useState(0)
  const [resending, setResending] = useState(false)

  // Supabase surfaces an expired/already-used confirmation link as an
  // error in the redirect's query/hash params (e.g.
  // ?error=access_denied&error_code=otp_expired&error_description=...),
  // not a thrown exception this app's own code would otherwise see - see
  // spec §2 "Expired/invalid verification links".
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const errorCode = searchParams.get('error_code') || hashParams.get('error_code')
  const linkExpired = errorCode === 'otp_expired'
  const linkError = Boolean(errorCode) && !linkExpired

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  // Already verified (including the moment a real confirmation click
  // lands and useAuth's onAuthStateChange picks up the fresh session) -
  // nothing left to do here.
  if (user?.emailVerified) {
    return <Navigate to="/" replace />
  }

  const email = user?.user.email || ''

  const handleResend = async () => {
    if (!email || cooldown > 0) return
    setResending(true)
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email })
      if (error) throw error
      toast({ title: 'Verification email sent', description: `Check ${email}.` })
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (error) {
      toast({
        title: "Couldn't resend",
        description: getErrorMessage(error, 'Please try again in a moment.'),
        variant: 'destructive',
      })
    } finally {
      setResending(false)
    }
  }

  const handleSignOutAndRetry = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[420px] flex-col justify-center px-6 py-16">
      <Text variant="label" tone="faint" as="div" className="mb-3">Verify your email</Text>

      {linkExpired ? (
        <>
          <Text variant="h1" as="h1">This link expired</Text>
          <Text variant="bodySm" tone="muted" as="p" className="mt-2">
            Confirmation links only stay valid for a little while. Request a new one below.
          </Text>
        </>
      ) : linkError ? (
        <>
          <Text variant="h1" as="h1">That link didn't work</Text>
          <Text variant="bodySm" tone="muted" as="p" className="mt-2">
            It may have already been used. Request a new one below, or check your inbox for a more recent email.
          </Text>
        </>
      ) : (
        <>
          <Text variant="h1" as="h1">Check your inbox</Text>
          <Text variant="bodySm" tone="muted" as="p" className="mt-2">
            {email
              ? <>We sent a verification link to <span className="font-semibold text-foreground">{email}</span>. Click it to unlock posting and messaging on CampusLink.</>
              : 'We sent a verification link to your email. Click it to unlock posting and messaging on CampusLink.'}
          </Text>
        </>
      )}

      <div className="mt-8">
        <Button onClick={handleResend} loading={resending} disabled={cooldown > 0 || !email} className="w-full">
          {cooldown > 0 ? `Resend email (${cooldown}s)` : 'Resend email'}
        </Button>
      </div>

      <div className="mt-8">
        <Rule />
        <div className="flex items-center justify-between pt-5">
          <Text variant="caption" tone="faint">Signed up with the wrong address?</Text>
          <button
            type="button"
            onClick={handleSignOutAndRetry}
            className="font-body text-body-sm font-medium text-primary-deep underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Sign out and try again
          </button>
        </div>
      </div>
    </div>
  )
}

export default VerifyEmail
