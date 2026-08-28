import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const mockSignOut = vi.fn()
const mockChangePassword = vi.fn()
const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockSetTheme = vi.fn()
const mockUseTheme = vi.fn()
vi.mock('next-themes', () => ({
  useTheme: () => mockUseTheme(),
}))

const mockSavePreferences = vi.fn()
const mockSavePreferredPoints = vi.fn()
const mockResetPreferences = vi.fn()
const mockUsePreferences = vi.fn()
vi.mock('@/hooks/usePreferences', () => ({
  usePreferences: () => mockUsePreferences(),
}))

// DiscoverySettings requests a position itself (so the browser permission
// prompt fires right on this page, not only once Home happens to mount -
// see DiscoverySettings.tsx) - mocked here the same way Home.test.tsx
// mocks it, so these tests never touch the real geolocation API.
const mockUseDiscoveryLocation = vi.fn()
vi.mock('@/hooks/useDiscoveryLocation', () => ({
  useDiscoveryLocation: (enabled: boolean) => mockUseDiscoveryLocation(enabled),
}))

// DiscoverySettings checks `navigator.geolocation` directly (independent
// of the mocked hook above) to decide whether to offer the toggle at all
// (spec §3.4: unsupported browsers don't get a broken control) - jsdom
// has no real Geolocation API, so it must be stubbed for these tests to
// see the toggle the same way a real supporting browser would.
Object.defineProperty(globalThis.navigator, 'geolocation', {
  configurable: true,
  value: { getCurrentPosition: vi.fn(), watchPosition: vi.fn(), clearWatch: vi.fn() },
})

const DEFAULT_PREFERENCES = {
  user_id: 'user-1',
  discovery_radius_km: null,
  use_live_location: false,
  notify_chat_messages: true,
  notify_friend_events: true,
  discoverable: true,
  use_friends_in_recommendations: true,
  created_at: '',
}

const CAMPUS_POINTS_FIXTURE = [
  { id: 'mens-a', key: 'mens-a', label: "Men's Hostel A", kind: 'accommodation' as const, wing: 'mens' as const, lat: 1, lng: 1 },
  { id: 'ladies-a', key: 'ladies-a', label: 'Ladies Hostel A', kind: 'accommodation' as const, wing: 'ladies' as const, lat: 2, lng: 2 },
  { id: 'one-food', key: 'one-food', label: 'One Food World', kind: 'food' as const, wing: null, lat: 3, lng: 3 },
]
vi.mock('@/hooks/useCampusPoints', () => ({
  useCampusPoints: () => ({
    points: CAMPUS_POINTS_FIXTURE,
    byCategory: (kind: string) => CAMPUS_POINTS_FIXTURE.filter((p) => p.kind === kind),
    byKey: (key: string) => CAMPUS_POINTS_FIXTURE.find((p) => p.key === key),
    byWing: (wing: string | null) => CAMPUS_POINTS_FIXTURE.filter((p) => p.kind === 'accommodation' && p.wing === wing),
    loading: false,
  }),
  CAMPUS_POINT_CATEGORIES: [
    { kind: 'food', label: 'Food' },
    { kind: 'accommodation', label: 'Accommodation' },
  ],
}))

const { default: Settings } = await import('./Settings')

const AUTH_USER = {
  user: { id: 'user-1', email: 'jane@vitstudent.ac.in' },
  profile: { id: 'user-1', name: 'Jane Doe', email: 'jane@vitstudent.ac.in', phone: '9876543210' },
  emailVerified: true,
}

const renderSettings = () => render(<MemoryRouter><Settings /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ user: AUTH_USER, signOut: mockSignOut, changePassword: mockChangePassword })
  mockUseTheme.mockReturnValue({ theme: 'light', setTheme: mockSetTheme })
  mockUsePreferences.mockReturnValue({
    preferences: DEFAULT_PREFERENCES,
    preferredPointIds: new Set(),
    loading: false,
    savePreferences: mockSavePreferences,
    savePreferredPoints: mockSavePreferredPoints,
    resetPreferences: mockResetPreferences,
  })
  mockUseDiscoveryLocation.mockReturnValue({ status: 'idle' })
})

describe('Settings', () => {
  it('shows the real signed-in email, not a placeholder', () => {
    renderSettings()
    expect(screen.getByText('jane@vitstudent.ac.in')).toBeInTheDocument()
  })

  it('does not invent unsupported settings categories', () => {
    renderSettings()
    expect(screen.queryByText(/wallet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/balance/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/verification/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/language/i)).not.toBeInTheDocument()
    // Notifications is now a real section (Phase 3H) - but only the two
    // genuinely-toggleable categories, never the five order-lifecycle
    // types, which have no control anywhere on this page.
    expect(screen.queryByText(/order accepted/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/order picked up/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/order delivered/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/order cancelled/i)).not.toBeInTheDocument()
  })

  it('toggles dark mode via the real theme system', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('switch', { name: /toggle dark mode/i }))
    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })

  it('signs out through the real auth flow and redirects to login', async () => {
    mockSignOut.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('button', { name: /^sign out$/i }))

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  describe('change password', () => {
    it('blocks submission and shows an error when the new password is too short', async () => {
      const user = userEvent.setup()
      renderSettings()
      await user.click(screen.getByRole('button', { name: /change password/i }))

      await user.type(screen.getByLabelText(/current password/i), 'oldpassword')
      await user.type(screen.getByLabelText(/^new password$/i), 'short')
      await user.type(screen.getByLabelText(/confirm new password/i), 'short')
      await user.click(screen.getByRole('button', { name: /^save$/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i)
      expect(mockChangePassword).not.toHaveBeenCalled()
    })

    it('blocks submission when the confirmation does not match', async () => {
      const user = userEvent.setup()
      renderSettings()
      await user.click(screen.getByRole('button', { name: /change password/i }))

      await user.type(screen.getByLabelText(/current password/i), 'oldpassword')
      await user.type(screen.getByLabelText(/^new password$/i), 'newpassword1')
      await user.type(screen.getByLabelText(/confirm new password/i), 'newpassword2')
      await user.click(screen.getByRole('button', { name: /^save$/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i)
      expect(mockChangePassword).not.toHaveBeenCalled()
    })

    it('submits real credentials and closes on success', async () => {
      mockChangePassword.mockResolvedValue(undefined)
      const user = userEvent.setup()
      renderSettings()
      await user.click(screen.getByRole('button', { name: /change password/i }))

      await user.type(screen.getByLabelText(/current password/i), 'oldpassword')
      await user.type(screen.getByLabelText(/^new password$/i), 'newpassword1')
      await user.type(screen.getByLabelText(/confirm new password/i), 'newpassword1')
      await user.click(screen.getByRole('button', { name: /^save$/i }))

      await waitFor(() =>
        expect(mockChangePassword).toHaveBeenCalledWith('oldpassword', 'newpassword1', 'newpassword1')
      )
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Password updated' })))
      await waitFor(() => expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument())
    })

    it('shows a clear error and keeps the dialog open when the current password is wrong', async () => {
      mockChangePassword.mockRejectedValue(new Error('Current password is incorrect.'))
      const user = userEvent.setup()
      renderSettings()
      await user.click(screen.getByRole('button', { name: /change password/i }))

      await user.type(screen.getByLabelText(/current password/i), 'wrongpassword')
      await user.type(screen.getByLabelText(/^new password$/i), 'newpassword1')
      await user.type(screen.getByLabelText(/confirm new password/i), 'newpassword1')
      await user.click(screen.getByRole('button', { name: /^save$/i }))

      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: expect.stringMatching(/could not update password/i) })
        )
      )
      expect(screen.getByLabelText(/current password/i)).toBeInTheDocument()
    })
  })
})

describe('Settings — Discovery (Phase 3H)', () => {
  it('shows the "Use my current location" switch, off by default', () => {
    renderSettings()
    const toggle = screen.getByRole('switch', { name: /use my current location/i })
    expect(toggle).not.toBeChecked()
  })

  it('does not show radius presets while current location is off', () => {
    renderSettings()
    expect(screen.queryByRole('button', { name: /^500 m$/i })).not.toBeInTheDocument()
  })

  it('shows only campus-scale radius presets (50/100/200/500m), never 1km/2km, once current location is on, reflecting the saved value', () => {
    mockUsePreferences.mockReturnValue({
      preferences: { ...DEFAULT_PREFERENCES, use_live_location: true, discovery_radius_km: 0.1 },
      preferredPointIds: new Set(),
      loading: false,
      savePreferences: mockSavePreferences,
      savePreferredPoints: mockSavePreferredPoints,
      resetPreferences: mockResetPreferences,
    })
    renderSettings()

    expect(screen.getByRole('button', { name: /^50 m$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^200 m$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^500 m$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^100 m$/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^200 m$/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: /km/i })).not.toBeInTheDocument()
  })

  it('saves the toggle immediately on change, injecting a sensible campus-scale default radius (never 1km/2km)', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('switch', { name: /use my current location/i }))
    expect(mockSavePreferences).toHaveBeenCalledWith('user-1', { use_live_location: true, discovery_radius_km: 0.2 })
  })

  it('does not override an already-chosen radius when re-toggling on', async () => {
    mockUsePreferences.mockReturnValue({
      preferences: { ...DEFAULT_PREFERENCES, use_live_location: false, discovery_radius_km: 0.05 },
      preferredPointIds: new Set(),
      loading: false,
      savePreferences: mockSavePreferences,
      savePreferredPoints: mockSavePreferredPoints,
      resetPreferences: mockResetPreferences,
    })
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('switch', { name: /use my current location/i }))
    expect(mockSavePreferences).toHaveBeenCalledWith('user-1', { use_live_location: true })
  })

  it('requests the browser permission prompt as soon as the toggle turns on, not deferred to Home', () => {
    mockUsePreferences.mockReturnValue({
      preferences: { ...DEFAULT_PREFERENCES, use_live_location: true, discovery_radius_km: 0.1 },
      preferredPointIds: new Set(),
      loading: false,
      savePreferences: mockSavePreferences,
      savePreferredPoints: mockSavePreferredPoints,
      resetPreferences: mockResetPreferences,
    })
    renderSettings()

    expect(mockUseDiscoveryLocation).toHaveBeenCalledWith(true)
  })

  it('saves the selected radius preset', async () => {
    mockUsePreferences.mockReturnValue({
      preferences: { ...DEFAULT_PREFERENCES, use_live_location: true },
      preferredPointIds: new Set(),
      loading: false,
      savePreferences: mockSavePreferences,
      savePreferredPoints: mockSavePreferredPoints,
      resetPreferences: mockResetPreferences,
    })
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('button', { name: /^500 m$/i }))
    expect(mockSavePreferences).toHaveBeenCalledWith('user-1', { discovery_radius_km: 0.5 })
  })

  it('hides the toggle entirely (not a broken control) when the browser has no geolocation support', () => {
    Object.defineProperty(globalThis.navigator, 'geolocation', { configurable: true, value: undefined })
    renderSettings()

    expect(screen.queryByRole('switch', { name: /use my current location/i })).not.toBeInTheDocument()
    expect(screen.getByText(/doesn't support location/i)).toBeInTheDocument()

    // restore for subsequent tests in this file
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: vi.fn(), watchPosition: vi.fn(), clearWatch: vi.fn() },
    })
  })

  it('the preferred-areas picker respects wing distinctness - Men\'s Hostel A and Ladies Hostel A are separate, independent choices', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('button', { name: /choose areas/i }))
    const mensCheckbox = screen.getByRole('checkbox', { name: /men's hostel a/i })
    const ladiesCheckbox = screen.getByRole('checkbox', { name: /ladies hostel a/i })
    expect(mensCheckbox).not.toBeChecked()
    expect(ladiesCheckbox).not.toBeChecked()

    await user.click(mensCheckbox)
    expect(mensCheckbox).toBeChecked()
    expect(ladiesCheckbox).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: /^save$/i }))
    expect(mockSavePreferredPoints).toHaveBeenCalledWith('user-1', ['mens-a'])
  })

  it('resets discovery preferences back to defaults', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('button', { name: /reset discovery preferences/i }))
    expect(mockResetPreferences).toHaveBeenCalledWith('user-1')
  })

  it('a legacy user (defaults from the hook, no error) sees every default correctly', () => {
    renderSettings()
    expect(screen.getByRole('switch', { name: /use my current location/i })).not.toBeChecked()
    expect(screen.getByText(/none selected yet/i)).toBeInTheDocument()
  })
})

describe('Settings — Privacy toggles (Phase 3H)', () => {
  it('shows discoverability and friend-ranking toggles, defaulting on', () => {
    renderSettings()
    expect(screen.getByRole('switch', { name: /let other students find me by name/i })).toBeChecked()
    expect(screen.getByRole('switch', { name: /use my friendships to personalize recommended/i })).toBeChecked()
  })

  it('saves discoverability when toggled off', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('switch', { name: /let other students find me by name/i }))
    expect(mockSavePreferences).toHaveBeenCalledWith('user-1', { discoverable: false })
  })

  it('saves the friend-ranking preference when toggled off', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('switch', { name: /use my friendships to personalize recommended/i }))
    expect(mockSavePreferences).toHaveBeenCalledWith('user-1', { use_friends_in_recommendations: false })
  })
})

describe('Settings — Notification preferences (Phase 3H)', () => {
  it('shows exactly the two real toggle-able categories, defaulting on', () => {
    renderSettings()
    expect(screen.getByRole('switch', { name: /notify me about chat messages/i })).toBeChecked()
    expect(screen.getByRole('switch', { name: /notify me about friend requests/i })).toBeChecked()
  })

  it('saves the chat-message preference when toggled off', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('switch', { name: /notify me about chat messages/i }))
    expect(mockSavePreferences).toHaveBeenCalledWith('user-1', { notify_chat_messages: false })
  })

  it('saves the friend-events preference when toggled off', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('switch', { name: /notify me about friend requests/i }))
    expect(mockSavePreferences).toHaveBeenCalledWith('user-1', { notify_friend_events: false })
  })
})
