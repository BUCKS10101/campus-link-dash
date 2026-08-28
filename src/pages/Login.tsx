import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Text, Rule } from '@/components/primitives'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/use-toast'
import { cn, getErrorMessage } from '@/lib/utils'

// Bespoke underline field: same Input/Label primitives everywhere else in
// the app, restyled only here via className. Counter separates with rules
// rather than boxes — a bordered input box is the one place the rest of
// the app still looks like a generic form, so Login gets the ledger-line
// treatment instead. Nothing about the primitives themselves changes.
const fieldInputClass =
  'h-auto rounded-none border-0 border-b-2 border-border bg-transparent px-0 py-2 text-body ' +
  'shadow-none placeholder:text-faint hover:border-ring/50 ' +
  'focus-visible:border-foreground focus-visible:ring-0 focus-visible:ring-offset-0 ' +
  'aria-[invalid=true]:border-destructive md:text-body'

const Login = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user, signUp, signIn } = useAuth()
  const [step, setStep] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: ''
  })

  // Phase 3J: a fresh signUp() sets `user` truthy the instant the session
  // exists, same as sign-in - this effect would otherwise race
  // handleRegister's own explicit navigate('/verify-email') below and
  // send a just-registered, still-unverified user to Home instead. See
  // PHASE3_3J_TRUST_SAFETY_SPEC.md §2.
  const justRegisteredRef = useRef(false)

  useEffect(() => {
    if (user && !justRegisteredRef.current) {
      navigate('/')
    }
  }, [user, navigate])

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleLogin = async () => {
    if (!formData.email || !formData.password) {
      toast({
        title: "Missing information",
        description: "Enter your email and password to continue.",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      await signIn(formData.email, formData.password)
      toast({ title: "Welcome back" })
    } catch (error) {
      const message = getErrorMessage(error, "Please try again.")
      const friendlyMessage =
        message === 'Invalid login credentials' ? "That email and password don't match."
        : message === 'Email not confirmed' ? "Verify your email before signing in - check your inbox for the confirmation link."
        : message
      toast({
        title: "That didn't work",
        description: friendlyMessage,
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    if (!formData.fullName || !formData.email || !formData.phone || !formData.password) {
      toast({
        title: "Missing information",
        description: "Fill in every field to create an account.",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      justRegisteredRef.current = true
      await signUp(formData.email, formData.password, {
        fullName: formData.fullName,
        phone: formData.phone
      })
      toast({
        title: "Account created",
        description: "Check your email to verify your account."
      })
      navigate('/verify-email')
    } catch (error) {
      justRegisteredRef.current = false
      toast({
        title: "Couldn't create your account",
        description: getErrorMessage(error, "Please try again."),
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (step === 'login') void handleLogin()
    else void handleRegister()
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto grid min-h-[100dvh] max-w-layout md:grid-cols-[1.15fr_1fr]">
        {/* Identity panel — desktop only, a deliberate forest color field
            (the one large block of it on this screen). Centred rather
            than pinned edge-to-edge, so it composes at any viewport
            height instead of clipping a tall headline against a short
            window. */}
        <div className="hidden flex-col justify-center gap-14 bg-foreground px-12 py-16 text-background md:flex lg:px-16">
          <Text variant="label" tone="inherit" as="div" className="opacity-60">CampusLink</Text>

          <div className="max-w-[30ch]">
            <Text variant="display" accent tone="inherit" className="block text-display-sm lg:text-display">
              Someone nearby<br />is already going.
            </Text>
            <div className="mt-7 w-12 border-t-2 border-background/40" />
            <Text variant="body" tone="inherit" className="mt-6 block max-w-[36ch] opacity-80">
              Post what you need, or carry something for another student on
              your way. No fleet, no strangers — just the people already
              walking your route.
            </Text>
          </div>

          <Text variant="caption" tone="inherit" className="opacity-60">VIT campus, block to block.</Text>
        </div>

        {/* Form panel */}
        <div className="flex flex-col px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-10 sm:px-12 md:px-16 md:py-16">
          <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center">
            <div className="mb-10 flex items-baseline justify-between md:hidden">
              <Text variant="h2" as="div">CampusLink</Text>
              <Text variant="caption" tone="faint" accent>block to block</Text>
            </div>

            <Text variant="label" tone="faint" as="div" className="mb-3">
              {step === 'login' ? 'Sign in' : 'Register'}
            </Text>
            <Text variant="h1" as="h1">
              {step === 'login' ? 'Welcome back' : 'Join CampusLink'}
            </Text>
            <Text variant="bodySm" tone="muted" as="p" className="mt-2">
              {step === 'login'
                ? 'Sign in with your credentials.'
                : 'Register with your VIT student details.'}
            </Text>

            <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-6" noValidate>
              {step === 'register' && (
                <div className="flex flex-col gap-2">
                  <Text as="label" variant="label" tone="faint" htmlFor="fullName">Full name</Text>
                  <Input
                    id="fullName"
                    placeholder="Enter your full name"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                    autoComplete="name"
                    className={fieldInputClass}
                  />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Text as="label" variant="label" tone="faint" htmlFor="email">
                  {step === 'register' ? 'VIT email' : 'Email'}
                </Text>
                <Input
                  id="email"
                  type="email"
                  placeholder="yourname@vitstudent.ac.in"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  autoComplete="email"
                  className={fieldInputClass}
                />
              </div>

              {step === 'register' && (
                <div className="flex flex-col gap-2">
                  <Text as="label" variant="label" tone="faint" htmlFor="phone">Phone number</Text>
                  <div className="flex items-end">
                    <span className="flex h-11 items-center border-b-2 border-border pr-2 font-data text-body-sm text-muted-foreground">
                      +91
                    </span>
                    <Input
                      id="phone"
                      placeholder="10-digit number"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      maxLength={10}
                      autoComplete="tel-national"
                      className={cn(fieldInputClass, 'pl-2')}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Text as="label" variant="label" tone="faint" htmlFor="password">Password</Text>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={step === 'register' ? 'Create a password' : 'Enter your password'}
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className={cn(fieldInputClass, 'pr-14')}
                    autoComplete={step === 'register' ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 font-data text-caption font-medium uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-3">
                <Button type="submit" loading={loading} className="w-full">
                  {step === 'login' ? 'Sign in' : 'Create account'}
                </Button>
                <div
                  className={cn(
                    'font-body text-caption text-muted-foreground transition-opacity duration-base ease-out',
                    loading ? 'animate-rise-in opacity-100' : 'opacity-0',
                  )}
                  role="status"
                  aria-live="polite"
                >
                  {loading ? (step === 'login' ? 'Checking your details…' : 'Setting up your account…') : ''}
                </div>
              </div>
            </form>

            <div className="mt-10 w-full">
              <Rule />
              <div className="flex items-center justify-between pt-5">
                <Text variant="caption" tone="faint">
                  {step === 'login' ? 'New here?' : 'Already registered?'}
                </Text>
                <button
                  type="button"
                  onClick={() => setStep(step === 'login' ? 'register' : 'login')}
                  className="font-body text-body-sm font-medium text-primary-deep underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {step === 'login' ? 'Register' : 'Sign in'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
