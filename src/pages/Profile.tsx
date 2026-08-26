import React, { useState } from 'react'
import { useTheme } from 'next-themes'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
import { getErrorMessage } from '@/lib/utils'
import { ProfileUpdateSchema } from '@/lib/validation'
import { Text } from '@/components/primitives'

type FieldErrors = { name?: string; phone?: string }

/** Client-side mirror of ProfileUpdateSchema, run on every keystroke so the
 * user sees a problem before they ever hit Save - the server validates the
 * same shape again on submit regardless. */
const validateField = (field: 'name' | 'phone', value: string): string | undefined => {
  if (value === '') return undefined // empty just means "not changing this field"
  const mask: Partial<Record<'name' | 'phone', true>> = { [field]: true }
  const result = ProfileUpdateSchema.pick(mask).safeParse({ [field]: value })
  return result.success ? undefined : result.error.issues[0]?.message
}

const EditProfileDialog = ({
  fullName,
  phone,
  onSave,
}: {
  fullName: string
  phone: string
  onSave: (updates: { name: string; phone: string }) => Promise<void>
}) => {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: fullName, phone })
  const [errors, setErrors] = useState<FieldErrors>({})

  const resetToCurrent = () => {
    setForm({ name: fullName, phone })
    setErrors({})
  }

  const handleFieldChange = (field: 'name' | 'phone', value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: validateField(field, value) }))
  }

  const hasErrors = Boolean(errors.name || errors.phone)

  const handleSave = async () => {
    const nameError = validateField('name', form.name)
    const phoneError = validateField('phone', form.phone)
    if (nameError || phoneError) {
      setErrors({ name: nameError, phone: phoneError })
      return
    }

    setSaving(true)
    try {
      await onSave(form)
      toast({ title: 'Saved' })
      setOpen(false)
    } catch (error) {
      toast({
        title: 'Could not save',
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) resetToCurrent() }}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="font-body text-body-sm font-semibold text-primary-deep underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Edit profile
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-h2 font-normal">Edit profile</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5 py-2">
          <div className="flex flex-col gap-2">
            <Text as="label" variant="label" tone="faint" htmlFor="edit-full-name">Full name</Text>
            <Input
              id="edit-full-name"
              value={form.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'edit-full-name-error' : undefined}
            />
            {errors.name && (
              <Text id="edit-full-name-error" variant="caption" tone="danger" role="alert">{errors.name}</Text>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Text as="label" variant="label" tone="faint" htmlFor="edit-phone">Phone (10 digits)</Text>
            <Input
              id="edit-phone"
              value={form.phone}
              maxLength={10}
              onChange={(e) => handleFieldChange('phone', e.target.value)}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? 'edit-phone-error' : undefined}
            />
            {errors.phone && (
              <Text id="edit-phone-error" variant="caption" tone="danger" role="alert">{errors.phone}</Text>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose asChild>
            <Button variant="ghost" onClick={resetToCurrent}>Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} loading={saving} disabled={hasErrors}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const Profile = () => {
  const { user, loading: authLoading, updateProfile } = useAuth()
  const { theme, setTheme } = useTheme()

  if (authLoading) {
    return (
      <div className="max-w-measure">
        <div className="flex items-center gap-4 border-b-2 border-foreground pb-6">
          <Skeleton className="size-14 shrink-0" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-32" />
        </div>
      </div>
    )
  }

  const profile = user?.profile
  const displayName = profile?.name || 'Your profile'
  const displayPhone = profile?.phone ? `+91-${profile.phone}` : 'No phone on file'
  const avatarInitial = displayName.charAt(0).toUpperCase() || '?'
  const block = profile?.hostel_block

  const handleSaveProfile = async (updates: { name: string; phone: string }) => {
    await updateProfile(updates)
  }

  return (
    <div className="max-w-measure">
      <div className="flex items-center gap-6 border-b-2 border-foreground pb-10">
        <div className="flex size-20 shrink-0 items-center justify-center bg-primary font-display text-display-sm font-normal text-primary-foreground">
          {block || avatarInitial}
        </div>
        <div className="min-w-0">
          <Text variant="display" accent className="block text-[2.75rem] leading-[0.98] sm:text-[3.25rem]">
            {displayName}
          </Text>
          <Text variant="bodySm" tone="muted" as="p" className="mt-2">
            {profile?.email || user?.user.email} · {displayPhone}
          </Text>
        </div>
      </div>

      <div className="mt-12">
        <Text variant="label" tone="faint" as="div" className="pb-3">Manage</Text>

        <div className="flex items-center justify-between border-b-2 border-foreground py-6">
          <div>
            <Text variant="h3" className="block">Profile details</Text>
            <Text variant="caption" tone="muted" as="p" className="mt-0.5">Name and phone number.</Text>
          </div>
          <EditProfileDialog
            fullName={profile?.name || ''}
            phone={profile?.phone || ''}
            onSave={handleSaveProfile}
          />
        </div>

        <div className="flex items-center justify-between py-6">
          <div>
            <Text variant="h3" className="block">Activity</Text>
            <Text variant="caption" tone="muted" as="p" className="mt-0.5">What you've asked for and carried.</Text>
          </div>
          <Link
            to="/my-orders"
            className="font-body text-body-sm font-semibold text-primary-deep underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            View activity
          </Link>
        </div>
      </div>

      <div className="mt-12">
        <Text variant="label" tone="faint" as="div" className="pb-3">Preferences</Text>

        <div className="flex items-center justify-between border-b-2 border-foreground py-6">
          <div>
            <Text variant="h3" className="block">Dark mode</Text>
            <Text variant="caption" tone="muted" as="p" className="mt-0.5">Switch the whole app's appearance.</Text>
          </div>
          <Switch
            checked={theme === 'dark'}
            onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
            aria-label="Toggle dark mode"
          />
        </div>
      </div>
    </div>
  )
}

export default Profile
