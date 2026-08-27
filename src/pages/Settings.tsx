import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/use-toast'
import { usePreferences } from '@/hooks/usePreferences'
import { DiscoverySettings } from '@/components/settings/DiscoverySettings'
import { getErrorMessage } from '@/lib/utils'
import { ChangePasswordSchema } from '@/lib/validation'
import { Text } from '@/components/primitives'

type PasswordForm = { currentPassword: string; newPassword: string; confirmPassword: string }
type PasswordErrors = Partial<Record<keyof PasswordForm, string>>

const EMPTY_FORM: PasswordForm = { currentPassword: '', newPassword: '', confirmPassword: '' }

/** Validates the whole form (the confirm-match rule needs both fields), not per-keystroke per-field. */
const validatePasswordForm = (form: PasswordForm): PasswordErrors => {
  const result = ChangePasswordSchema.safeParse(form)
  if (result.success) return {}
  const errors: PasswordErrors = {}
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof PasswordForm
    if (!errors[field]) errors[field] = issue.message
  }
  return errors
}

const ChangePasswordDialog = () => {
  const { changePassword } = useAuth()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<PasswordForm>(EMPTY_FORM)
  const [errors, setErrors] = useState<PasswordErrors>({})

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setErrors({})
  }

  const handleFieldChange = (field: keyof PasswordForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    const validation = validatePasswordForm(form)
    if (Object.keys(validation).length > 0) {
      setErrors(validation)
      return
    }

    setSaving(true)
    try {
      await changePassword(form.currentPassword, form.newPassword, form.confirmPassword)
      toast({ title: 'Password updated' })
      setOpen(false)
      resetForm()
    } catch (error) {
      toast({
        title: 'Could not update password',
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) resetForm() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Change password</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-h2 font-normal">Change password</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5 py-2">
          <div className="flex flex-col gap-2">
            <Text as="label" variant="label" tone="faint" htmlFor="current-password">Current password</Text>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => handleFieldChange('currentPassword', e.target.value)}
              aria-invalid={Boolean(errors.currentPassword)}
              aria-describedby={errors.currentPassword ? 'current-password-error' : undefined}
            />
            {errors.currentPassword && (
              <Text id="current-password-error" variant="caption" tone="danger" role="alert">{errors.currentPassword}</Text>
            )}
          </div>
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
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose asChild>
            <Button variant="ghost" onClick={resetForm}>Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} loading={saving}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const SettingsRow = ({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) => (
  <div className="flex items-center justify-between gap-4 border-b-2 border-foreground py-6 last:border-b-0">
    <div className="min-w-0">
      <Text variant="h3" className="block">{title}</Text>
      {description && (
        <Text variant="caption" tone="muted" as="p" className="mt-0.5">{description}</Text>
      )}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
)

const Settings = () => {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()
  // Phase 3H — shared PreferencesProvider (App.tsx), the same live state
  // Home reads - see PHASE3_3H_PREFERENCES_PERSONALIZATION_SPEC.md §14.
  const { preferences, preferredPointIds, savePreferences, savePreferredPoints, resetPreferences } = usePreferences()

  const email = user?.profile?.email || user?.user.email || ''

  const handleTogglePreference = async (key: 'discoverable' | 'use_friends_in_recommendations' | 'notify_chat_messages' | 'notify_friend_events', checked: boolean) => {
    if (!user) return
    try {
      await savePreferences(user.user.id, { [key]: checked })
    } catch (error) {
      toast({ title: 'Could not save', description: getErrorMessage(error, 'Please try again.'), variant: 'destructive' })
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/login')
    } catch (error) {
      toast({
        title: 'Could not sign out',
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="max-w-measure">
      <div className="border-b-2 border-foreground pb-6">
        <Text variant="display" accent className="block text-[2.75rem] leading-[0.98] sm:text-[3.25rem]">
          Settings
        </Text>
      </div>

      <div className="mt-12">
        <Text variant="label" tone="faint" as="div" className="pb-3">Account</Text>
        <SettingsRow title="Signed in as" description={email} />
        <SettingsRow
          title="Password"
          description="Change the password you use to sign in."
          action={<ChangePasswordDialog />}
        />
        <SettingsRow
          title="Sign out"
          description="End your session on this device."
          action={<Button variant="ghost" size="sm" onClick={handleSignOut}>Sign out</Button>}
        />
      </div>

      {user && preferences && (
        <div className="mt-12">
          <Text variant="label" tone="faint" as="div" className="pb-3">Discovery</Text>
          <DiscoverySettings
            userId={user.user.id}
            preferences={preferences}
            preferredPointIds={preferredPointIds}
            savePreferences={savePreferences}
            savePreferredPoints={savePreferredPoints}
            resetPreferences={resetPreferences}
          />
        </div>
      )}

      <div className="mt-12">
        <Text variant="label" tone="faint" as="div" className="pb-3">Privacy</Text>
        <SettingsRow
          title="Live location while delivering"
          description="Only shared with the requester of an order you're actively delivering, only while it's picked up or out for delivery, and never stored - it stops the moment the order is delivered or cancelled."
        />
        {preferences && (
          <>
            <SettingsRow
              title="Let other students find me by name"
              description="Turning this off only affects future searches - it doesn't hide you from existing friends or anyone you already have an order with."
              action={
                <Switch
                  checked={preferences.discoverable}
                  onCheckedChange={(checked) => handleTogglePreference('discoverable', checked)}
                  aria-label="Let other students find me by name"
                />
              }
            />
            <SettingsRow
              title="Use my friendships to personalize Recommended"
              description="When off, friends' errands are ranked the same as anyone else's in your Recommended tab."
              action={
                <Switch
                  checked={preferences.use_friends_in_recommendations}
                  onCheckedChange={(checked) => handleTogglePreference('use_friends_in_recommendations', checked)}
                  aria-label="Use my friendships to personalize Recommended"
                />
              }
            />
          </>
        )}
      </div>

      {preferences && (
        <div className="mt-12">
          <Text variant="label" tone="faint" as="div" className="pb-3">Notifications</Text>
          <SettingsRow
            title="Chat messages"
            description="A ping when someone messages you about an order."
            action={
              <Switch
                checked={preferences.notify_chat_messages}
                onCheckedChange={(checked) => handleTogglePreference('notify_chat_messages', checked)}
                aria-label="Notify me about chat messages"
              />
            }
          />
          <SettingsRow
            title="Friend requests"
            description="A ping when someone sends or accepts a friend request."
            action={
              <Switch
                checked={preferences.notify_friend_events}
                onCheckedChange={(checked) => handleTogglePreference('notify_friend_events', checked)}
                aria-label="Notify me about friend requests"
              />
            }
          />
        </div>
      )}

      <div className="mt-12">
        <Text variant="label" tone="faint" as="div" className="pb-3">Appearance</Text>
        <SettingsRow
          title="Dark mode"
          description="Switch the whole app's appearance."
          action={
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              aria-label="Toggle dark mode"
            />
          }
        />
      </div>

      <div className="mt-12">
        <Text variant="label" tone="faint" as="div" className="pb-3">About</Text>
        <SettingsRow
          title="CampusLink"
          description="A student-to-student errand board for campus - post what you need, or pick up someone else's run."
        />
      </div>
    </div>
  )
}

export default Settings
