import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const mockUpdateProfile = vi.fn()
const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockSetTheme = vi.fn()
const mockUseTheme = vi.fn()
vi.mock('next-themes', () => ({
  useTheme: () => mockUseTheme(),
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
  created_at: new Date().toISOString(),
}

const AUTH_USER = { user: { id: 'user-1', email: 'jane@vitstudent.ac.in' }, profile: PROFILE }

const renderProfile = () => render(<MemoryRouter><Profile /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ user: AUTH_USER, loading: false, updateProfile: mockUpdateProfile })
  mockUseTheme.mockReturnValue({ theme: 'light', setTheme: mockSetTheme })
})

describe('Profile', () => {
  it('shows a loading skeleton while auth is resolving, not the page content', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true, updateProfile: mockUpdateProfile })
    renderProfile()
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument()
  })

  it('renders real profile identity', () => {
    renderProfile()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText(/jane@vitstudent\.ac\.in/)).toBeInTheDocument()
    expect(screen.getByText(/9876543210/)).toBeInTheDocument()
  })

  it('shows no fake or unpopulated stats - deliveries, rating, and balance are all dead data with no real writer anywhere', () => {
    renderProfile()
    expect(screen.queryByText(/deliveries/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/rating/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/balance/i)).not.toBeInTheDocument()
  })

  it('shows no fake settings - only the real, wired dark mode toggle', () => {
    renderProfile()
    expect(screen.queryByText(/notification/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/privacy/i)).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /toggle dark mode/i })).toBeInTheDocument()
  })

  it('links into Activity instead of duplicating order management here', () => {
    renderProfile()
    expect(screen.getByRole('link', { name: /view activity/i })).toHaveAttribute('href', '/my-orders')
  })

  it('toggles dark mode via the real theme system', async () => {
    const user = userEvent.setup()
    renderProfile()

    await user.click(screen.getByRole('switch', { name: /toggle dark mode/i }))
    expect(mockSetTheme).toHaveBeenCalledWith('dark')
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
})
