import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockSignOut = vi.fn()
const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockResend = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { resend: (...args: unknown[]) => mockResend(...args) } },
}))

const { default: VerifyEmail } = await import('./VerifyEmail')

const renderAt = (path = '/verify-email') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/" element={<div>Home Page</div>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({
    user: { user: { id: 'u1', email: 'jane@vitstudent.ac.in' }, profile: null, emailVerified: false },
    signOut: mockSignOut,
  })
})

describe('VerifyEmail', () => {
  it('shows the signed-up email and the resend action', () => {
    renderAt()
    expect(screen.getByText(/jane@vitstudent\.ac\.in/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /resend email/i })).toBeEnabled()
  })

  it('redirects to Home once the user is verified', () => {
    mockUseAuth.mockReturnValue({
      user: { user: { id: 'u1', email: 'jane@vitstudent.ac.in' }, profile: null, emailVerified: true },
      signOut: mockSignOut,
    })
    renderAt()
    expect(screen.getByText('Home Page')).toBeInTheDocument()
  })

  it('calls supabase.auth.resend with type signup and the account email', async () => {
    mockResend.mockResolvedValue({ error: null })
    renderAt()

    await userEvent.click(screen.getByRole('button', { name: /resend email/i }))
    expect(mockResend).toHaveBeenCalledWith({ type: 'signup', email: 'jane@vitstudent.ac.in' })
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Verification email sent' })))
  })

  it('enters a cooldown after a successful resend, disabling the button', async () => {
    mockResend.mockResolvedValue({ error: null })
    renderAt()

    await userEvent.click(screen.getByRole('button', { name: /resend email/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /resend email \(\d+s\)/i })).toBeDisabled())
  })

  it('surfaces a resend failure as a destructive toast', async () => {
    mockResend.mockResolvedValue({ error: { message: 'Rate limited' } })
    renderAt()

    await userEvent.click(screen.getByRole('button', { name: /resend email/i }))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't resend", variant: 'destructive' })))
  })

  it('shows the expired-link state when redirected back with error_code=otp_expired', () => {
    renderAt('/verify-email?error_code=otp_expired')
    expect(screen.getByText(/this link expired/i)).toBeInTheDocument()
  })

  it('shows a generic link-error state for any other auth error code', () => {
    renderAt('/verify-email?error_code=access_denied')
    expect(screen.getByText(/didn.t work/i)).toBeInTheDocument()
  })

  it('signs out and navigates to /login from "sign out and try again"', async () => {
    renderAt()
    await userEvent.click(screen.getByRole('button', { name: /sign out and try again/i }))
    expect(mockSignOut).toHaveBeenCalled()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'))
  })
})
