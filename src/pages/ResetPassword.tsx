import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Text, Rule } from '@/components/primitives'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/utils'
import { ResetPasswordSchema } from '@/lib/validation'

type FieldErrors = { newPassword?: string; confirmPassword?: string }

/**
 * QA audit AUTH-09 - no forgot/reset-password flow existed anywhere
 * before this. Reached only via the link Supabase emails from
 * sendPasswordResetEmail() (useAuth.tsx); by the time this page mounts,
 * Supabase's own detectSessionInUrl handling has already turned that
 * link's token into a real (recovery) session - `user` is truthy the
 * same way it would be after any other sign-in. No separate token
 * parsing or custom verification of any kind happens here.
 */
const ResetPassword = () => {
  const { updatePasswordAfterReset, signOut } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)

  // Same pattern as VerifyEmail.tsx: an expired/already-used recovery
  // link surfaces as query/hash error params on redirect, not a thrown
  // exception this app's own code would otherwise see.
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const errorCode = searchParams.get('error_code') || hashParams.get('error_code')
  const linkExpired = errorCode === 'otp_expired'
  const linkError = Boolean(errorCode) && !linkExpired

  const handleFieldChange = (field: keyof FieldErrors, value: string) => {
    const nextForm = { ...form, [field]: value }
    setForm(nextForm)
    if (value === '') {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
      return
    }
    // ResetPasswordSchema has a top-level .refine() (passwords must
    // match), so it can't be .pick()'d into a single-field schema like
    // Profile.tsx's plain-object ProfileUpdateSchema can - validate
    // against the full merged form instead and surface only this
    // field's own issue. This also means "confirm password" correctly
    // catches a mismatch against whatever's already in "new password".
    const result = ResetPasswordSchema.safeParse(nextForm)
    const issue = result.success ? undefined : result.error.issues.find((i) => i.path[0] === field)
    setErrors((prev) => ({ ...prev, [field]: issue?.message }))
  }

  const hasErrors = Boolean(errors.newPassword || errors.confirmPassword)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = ResetPasswordSchema.safeParse(form)
    if (!result.success) {
      const fieldErrors: FieldErrors = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FieldErrors
        fieldErrors[field] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setSaving(true)
    try {
      await updatePasswordAfterReset(form.newPassword, form.confirmPassword)
      toast({ title: 'Password updated', description: 'Sign in with your new password from now on.' })
      navigate('/')
    } catch (error) {
      toast({
        title: "Couldn't update password",
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleRequestNewLink = async () => {
    await signOut()
    navigate('/login')
  }

  // Access control: this route sits behind ProtectedRoute like every
  // other authenticated page, so an anonymous visitor is already
  // redirected to /login before ever reaching this component - the
  // recovery link itself is what gives an otherwise-signed-out visitor a
  // session in the first place (via Supabase's own detectSessionInUrl).
  // Scope decision, documented rather than silently accepted: this does
  // not additionally verify the *type* of that session is specifically
  // `recovery` (vs an already-open, unrelated session), so an already-
  // compromised session could also reach this form without re-proving
  // the current password, unlike changePassword() in Settings. Treated
  // as acceptable for this audit's scope - an attacker already holding a
  // live session can already do comparably sensitive things (post
  // orders, edit the profile) with it; building session-type tracking
  // into the shared AuthProvider to close this narrow gap is a larger
  // change than this fix warrants. Documented in QA_IMPLEMENTATION_PLAN.md.

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[420px] flex-col justify-center px-6 py-16">
      <Text variant="label" tone="faint" as="div" className="mb-3">Reset password</Text>

      {linkExpired ? (
        <>
          <Text variant="h1" as="h1">This link expired</Text>
          <Text variant="bodySm" tone="muted" as="p" className="mt-2">
            Password reset links only stay valid for a little while. Request a new one from the sign-in page.
          </Text>
          <div className="mt-8">
            <Button onClick={handleRequestNewLink} className="w-full">Back to sign in</Button>
          </div>
        </>
      ) : linkError ? (
        <>
          <Text variant="h1" as="h1">That link didn't work</Text>
          <Text variant="bodySm" tone="muted" as="p" className="mt-2">
            It may have already been used. Request a new one from the sign-in page.
          </Text>
          <div className="mt-8">
            <Button onClick={handleRequestNewLink} className="w-full">Back to sign in</Button>
          </div>
        </>
      ) : (
        <>
          <Text variant="h1" as="h1">Choose a new password</Text>
          <Text variant="bodySm" tone="muted" as="p" className="mt-2">
            You're almost done - pick a new password below.
          </Text>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5" noValidate>
            <div className="flex flex-col gap-2">
              <Text as="label" variant="label" tone="faint" htmlFor="new-password">New password</Text>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={form.newPassword}
                onChange={(e) => handleFieldChange('newPassword', e.target.value)}
                aria-invalid={Boolean(errors.newPassword)}
                aria-describedby={errors.newPassword ? 'new-password-error' : undefined}
              />
              {errors.newPassword && (
                <Text id="new-password-error" variant="caption" tone="danger" role="alert">{errors.newPassword}</Text>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Text as="label" variant="label" tone="faint" htmlFor="confirm-password">Confirm new password</Text>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(e) => handleFieldChange('confirmPassword', e.target.value)}
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
              />
              {errors.confirmPassword && (
                <Text id="confirm-password-error" variant="caption" tone="danger" role="alert">{errors.confirmPassword}</Text>
              )}
            </div>
            <Button type="submit" loading={saving} disabled={hasErrors} className="w-full">
              Update password
            </Button>
          </form>

          <div className="mt-8">
            <Rule />
          </div>
        </>
      )}
    </div>
  )
}

export default ResetPassword
