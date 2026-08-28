import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { createSupabaseMock, createStorageBucketMock } from '@/test/supabaseMock'

const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const supabaseMock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return supabaseMock
  },
}))

const mockUpdateProfile = vi.fn()
const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockGetProfileReputation = vi.fn()
vi.mock('@/hooks/useRatings', () => ({
  useRatings: () => ({ getProfileReputation: mockGetProfileReputation }),
}))

const mockFetchMyFriendships = vi.fn()
vi.mock('@/hooks/useFriends', () => ({
  useFriends: () => ({ fetchMyFriendships: mockFetchMyFriendships }),
}))

const mockGetMyActivitySummary = vi.fn()
vi.mock('@/hooks/useAnalytics', () => ({
  useAnalytics: () => ({ getMyActivitySummary: mockGetMyActivitySummary }),
}))

const { default: Profile } = await import('./Profile')

const PROFILE = {
  id: 'user-1',
  name: 'Jane Doe',
  email: 'jane@vitstudent.ac.in',
  phone: '9876543210',
  hostel_block: 'K',
  hostel_type: 'mens' as const,
  rating: null,
  successful_deliveries: 0,
  balance: 0,
  avatar_url: null,
  created_at: new Date().toISOString(),
}

const AUTH_USER = { user: { id: 'user-1', email: 'jane@vitstudent.ac.in' }, profile: PROFILE , emailVerified: true }

const renderProfile = () => render(<MemoryRouter><Profile /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ user: AUTH_USER, loading: false, updateProfile: mockUpdateProfile })
  mockGetProfileReputation.mockResolvedValue({ avg_rating: null, rating_count: 0, completed_deliveries: 0 })
  mockFetchMyFriendships.mockResolvedValue({ friends: [], received: [], sent: [] })
  mockGetMyActivitySummary.mockResolvedValue({
    posted_count: 0, posted_delivered_count: 0, posted_cancelled_count: 0,
    accepted_count: 0, completed_deliveries: 0, deliveries_cancelled_count: 0,
    avg_tip_given: null, avg_tip_earned: null,
  })
})

describe('Profile', () => {
  it('shows a loading skeleton while auth is resolving, not the page content', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true, updateProfile: mockUpdateProfile })
    renderProfile()
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument()
  })

  it('renders the heading as "{firstName}\'s profile", not the full name', () => {
    renderProfile()
    expect(screen.getByText("Jane's profile")).toBeInTheDocument()
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument()
  })

  it('renders real email and phone together on one contact line', () => {
    renderProfile()
    expect(screen.getByText(/jane@vitstudent\.ac\.in/)).toBeInTheDocument()
    expect(screen.getByText(/9876543210/)).toBeInTheDocument()
  })

  it('never shows the awkward "No phone on file" text when a phone exists', () => {
    renderProfile()
    expect(screen.queryByText(/no phone on file/i)).not.toBeInTheDocument()
  })

  it('gracefully omits the phone segment when no phone exists, without a placeholder', () => {
    mockUseAuth.mockReturnValue({
      user: { ...AUTH_USER, profile: { ...PROFILE, phone: null } },
      loading: false,
      updateProfile: mockUpdateProfile,
    })
    renderProfile()
    expect(screen.queryByText(/no phone on file/i)).not.toBeInTheDocument()
    expect(screen.getByText(/jane@vitstudent\.ac\.in/)).toBeInTheDocument()
  })

  it('never shows balance - payments are deferred, no wallet exists', () => {
    renderProfile()
    expect(screen.queryByText(/balance/i)).not.toBeInTheDocument()
  })

  describe('reputation (Phase 3D)', () => {
    it('shows real average rating and count once loaded, not a fabricated default', async () => {
      mockGetProfileReputation.mockResolvedValue({ avg_rating: 4.8, rating_count: 17, completed_deliveries: 23 })
      renderProfile()

      expect(await screen.findByText('4.8 · based on 17 ratings')).toBeInTheDocument()
      expect(screen.getByText('23')).toBeInTheDocument()
      expect(mockGetProfileReputation).toHaveBeenCalledWith('user-1')
    })

    it('shows "No ratings yet" instead of a fake 0.0 when the profile has never been rated', async () => {
      mockGetProfileReputation.mockResolvedValue({ avg_rating: null, rating_count: 0, completed_deliveries: 0 })
      renderProfile()

      expect(await screen.findByText('No ratings yet')).toBeInTheDocument()
      expect(screen.queryByText(/0\.0/)).not.toBeInTheDocument()
    })

    it('still shows a real (zero) completed-deliveries count for a new account', async () => {
      mockGetProfileReputation.mockResolvedValue({ avg_rating: null, rating_count: 0, completed_deliveries: 0 })
      // A distinct, non-zero friend count keeps this assertion unambiguous
      // (the Friends row below also renders a plain count) - Phase 3E.
      mockFetchMyFriendships.mockResolvedValue({ friends: [{}, {}], received: [], sent: [] })
      renderProfile()

      await screen.findByText('No ratings yet')
      const label = screen.getByText('Completed deliveries')
      expect(label.parentElement).toHaveTextContent('0')
    })

    it('uses singular "rating" for exactly one rating', async () => {
      mockGetProfileReputation.mockResolvedValue({ avg_rating: 5, rating_count: 1, completed_deliveries: 2 })
      renderProfile()

      expect(await screen.findByText('5.0 · based on 1 rating')).toBeInTheDocument()
    })
  })

  describe('activity summary (Phase 3I)', () => {
    it('does not show the activity section at all for a brand-new user with zero activity', async () => {
      renderProfile()
      await waitFor(() => expect(mockGetMyActivitySummary).toHaveBeenCalled())
      expect(screen.queryByText('Your activity')).not.toBeInTheDocument()
    })

    it('shows real requester and deliverer counts once loaded', async () => {
      mockGetMyActivitySummary.mockResolvedValue({
        posted_count: 5, posted_delivered_count: 3, posted_cancelled_count: 1,
        accepted_count: 4, completed_deliveries: 4, deliveries_cancelled_count: 0,
        avg_tip_given: 22, avg_tip_earned: 18.5,
      })
      renderProfile()

      expect(await screen.findByText('5 posted · 3 delivered · 1 cancelled')).toBeInTheDocument()
      expect(screen.getByText('4 accepted · 4 delivered · 0 cancelled')).toBeInTheDocument()
      expect(screen.getByText('₹22 average tip given')).toBeInTheDocument()
      expect(screen.getByText('₹19 average tip earned')).toBeInTheDocument()
    })

    it('never fabricates an average tip when none exists', async () => {
      mockGetMyActivitySummary.mockResolvedValue({
        posted_count: 1, posted_delivered_count: 0, posted_cancelled_count: 1,
        accepted_count: 0, completed_deliveries: 0, deliveries_cancelled_count: 0,
        avg_tip_given: null, avg_tip_earned: null,
      })
      renderProfile()

      await screen.findByText('1 posted · 0 delivered · 1 cancelled')
      expect(screen.queryByText(/average tip/i)).not.toBeInTheDocument()
    })

    it('shows the section once the requester side has activity even with zero deliverer activity', async () => {
      mockGetMyActivitySummary.mockResolvedValue({
        posted_count: 2, posted_delivered_count: 1, posted_cancelled_count: 0,
        accepted_count: 0, completed_deliveries: 0, deliveries_cancelled_count: 0,
        avg_tip_given: 30, avg_tip_earned: null,
      })
      renderProfile()

      expect(await screen.findByText('Your activity')).toBeInTheDocument()
      expect(screen.getByText('0 accepted · 0 delivered · 0 cancelled')).toBeInTheDocument()
    })
  })

  it('links into campus-wide Insights instead of embedding aggregate charts here', () => {
    renderProfile()
    expect(screen.getByRole('link', { name: /view insights/i })).toHaveAttribute('href', '/insights')
  })

  it('links into Settings instead of duplicating account controls here', () => {
    renderProfile()
    expect(screen.getByRole('link', { name: /open settings/i })).toHaveAttribute('href', '/settings')
  })

  it('links into Activity instead of duplicating order management here', () => {
    renderProfile()
    expect(screen.getByRole('link', { name: /view activity/i })).toHaveAttribute('href', '/activity/ordering')
  })

  describe('friends (Phase 3E)', () => {
    it('links into the dedicated Friends route instead of a social feed here', () => {
      renderProfile()
      expect(screen.getByRole('link', { name: /view friends/i })).toHaveAttribute('href', '/friends')
    })

    it('shows the real friend count once loaded', async () => {
      mockFetchMyFriendships.mockResolvedValue({ friends: [{}, {}, {}], received: [], sent: [] })
      renderProfile()

      const label = await screen.findByText('Friends')
      await waitFor(() => expect(label.parentElement).toHaveTextContent('3'))
      expect(mockFetchMyFriendships).toHaveBeenCalledWith('user-1')
    })
  })

  describe('editing', () => {
    it('opens with the current values pre-filled', async () => {
      const user = userEvent.setup()
      renderProfile()
      await user.click(screen.getByRole('button', { name: /edit profile/i }))

      expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Doe')
      expect(screen.getByLabelText(/phone/i)).toHaveValue('9876543210')
    })

    it('shows an inline validation error for a bad phone number and blocks Save', async () => {
      const user = userEvent.setup()
      renderProfile()
      await user.click(screen.getByRole('button', { name: /edit profile/i }))

      const phoneInput = screen.getByLabelText(/phone/i)
      await user.clear(phoneInput)
      await user.type(phoneInput, '123')

      expect(await screen.findByRole('alert')).toHaveTextContent(/10-digit/i)
      expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
      expect(mockUpdateProfile).not.toHaveBeenCalled()
    })

    it('saves successfully, toasts, and closes', async () => {
      mockUpdateProfile.mockResolvedValue(undefined)
      const user = userEvent.setup()
      renderProfile()
      await user.click(screen.getByRole('button', { name: /edit profile/i }))

      const nameInput = screen.getByLabelText(/full name/i)
      await user.clear(nameInput)
      await user.type(nameInput, 'Jane Renamed')
      await user.click(screen.getByRole('button', { name: /^save$/i }))

      await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledWith({ name: 'Jane Renamed', phone: '9876543210' }))
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Saved' })))
      await waitFor(() => expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument())
    })

    it('keeps the dialog open and the entered values on save failure', async () => {
      mockUpdateProfile.mockRejectedValue(new Error('Network error'))
      const user = userEvent.setup()
      renderProfile()
      await user.click(screen.getByRole('button', { name: /edit profile/i }))

      const nameInput = screen.getByLabelText(/full name/i)
      await user.clear(nameInput)
      await user.type(nameInput, 'Jane Renamed')
      await user.click(screen.getByRole('button', { name: /^save$/i }))

      await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringMatching(/could not save/i) })
      ))
      expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Renamed')
    })

    it('cancel discards changes without saving', async () => {
      const user = userEvent.setup()
      renderProfile()
      await user.click(screen.getByRole('button', { name: /edit profile/i }))

      const nameInput = screen.getByLabelText(/full name/i)
      await user.clear(nameInput)
      await user.type(nameInput, 'Someone Else')
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(mockUpdateProfile).not.toHaveBeenCalled()
      expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument()

      // Reopening shows the real, unchanged value - nothing leaked from the discarded edit.
      await user.click(screen.getByRole('button', { name: /edit profile/i }))
      expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Doe')
    })
  })

  describe('avatar upload', () => {
    const makeFile = (name: string, type: string, sizeBytes = 1024) => {
      const file = new File(['x'.repeat(sizeBytes)], name, { type })
      return file
    }

    it('shows the initial/block fallback when no avatar_url is set', () => {
      renderProfile()
      expect(screen.getByRole('button', { name: /change photo/i })).toHaveTextContent('K')
    })

    it('renders the real avatar image when avatar_url is set', () => {
      mockUseAuth.mockReturnValue({
        user: { ...AUTH_USER, profile: { ...PROFILE, avatar_url: 'https://example.test/jane.jpg' } },
        loading: false,
        updateProfile: mockUpdateProfile,
      })
      renderProfile()
      const img = screen.getByRole('button', { name: /change photo/i }).querySelector('img')
      expect(img).toHaveAttribute('src', 'https://example.test/jane.jpg')
    })

    it('uploads a selected image, persists the URL via updateProfile, and toasts success', async () => {
      const uploadMock = vi.fn(() => Promise.resolve({ data: { path: 'user-1/avatar.jpg' }, error: null }))
      const getPublicUrlMock = vi.fn(() => ({ data: { publicUrl: 'https://example.test/user-1/avatar.jpg' } }))
      supabaseMock.storage.from.mockReturnValue(createStorageBucketMock({ upload: uploadMock, getPublicUrl: getPublicUrlMock }))
      mockUpdateProfile.mockResolvedValue(undefined)

      const user = userEvent.setup()
      renderProfile()
      const input = screen.getByTestId('avatar-file-input')
      const file = makeFile('photo.jpg', 'image/jpeg')

      await user.upload(input, file)

      await waitFor(() => expect(uploadMock).toHaveBeenCalledWith('user-1/avatar.jpg', file, { upsert: true, contentType: 'image/jpeg' }))
      await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledWith({
        avatar_url: expect.stringMatching(/^https:\/\/example\.test\/user-1\/avatar\.jpg\?t=\d+$/),
      }))
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Photo updated' })))
    })

    it('rejects an unsupported file type before ever uploading (defense-in-depth beyond the accept attribute, which some mobile browsers ignore)', async () => {
      const uploadMock = vi.fn()
      supabaseMock.storage.from.mockReturnValue(createStorageBucketMock({ upload: uploadMock }))

      renderProfile()
      const input = screen.getByTestId('avatar-file-input') as HTMLInputElement
      const file = makeFile('doc.pdf', 'application/pdf')
      // fireEvent bypasses userEvent's own accept-attribute filtering, so
      // this exercises the component's own defensive type check directly -
      // a real browser's file picker would already filter this out via
      // `accept`, but some mobile browsers/webviews don't enforce it.
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      fireEvent.change(input)

      await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/unsupported file type/i) })))
      expect(uploadMock).not.toHaveBeenCalled()
    })

    it('rejects a file over the size limit before ever uploading', async () => {
      const uploadMock = vi.fn()
      supabaseMock.storage.from.mockReturnValue(createStorageBucketMock({ upload: uploadMock }))

      const user = userEvent.setup()
      renderProfile()
      const input = screen.getByTestId('avatar-file-input')
      const file = makeFile('huge.jpg', 'image/jpeg', 6 * 1024 * 1024)

      await user.upload(input, file)

      expect(uploadMock).not.toHaveBeenCalled()
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/too large/i) }))
    })

    it('shows an error toast, not a crash, when the upload itself fails', async () => {
      const uploadMock = vi.fn(() => Promise.resolve({ data: null, error: { message: 'Storage is down' } }))
      supabaseMock.storage.from.mockReturnValue(createStorageBucketMock({ upload: uploadMock }))

      const user = userEvent.setup()
      renderProfile()
      const input = screen.getByTestId('avatar-file-input')
      await user.upload(input, makeFile('photo.png', 'image/png'))

      await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: expect.stringMatching(/could not upload photo/i),
        description: 'Storage is down',
      })))
      expect(mockUpdateProfile).not.toHaveBeenCalled()
    })
  })
})
