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

const mockUpdatePasswordAfterReset = vi.fn()
const mockSignOut = vi.fn()
const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const { default: ResetPassword } = await import('./ResetPassword')

const renderAt = (path = '/reset-password') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={<div>Home Page</div>} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({
    updatePasswordAfterReset: mockUpdatePasswordAfterReset,
    signOut: mockSignOut,
  })
})

describe('ResetPassword', () => {
  it('shows the new-password form by default', () => {
    renderAt()
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument()
  })

  it('blocks submit and shows an inline error when passwords do not match', async () => {
    renderAt()
    await userEvent.type(screen.getByLabelText(/^new password$/i), 'password123')
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'different456')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i)
    expect(mockUpdatePasswordAfterReset).not.toHaveBeenCalled()
  })

  it('blocks submit for a too-short password', async () => {
    renderAt()
    const input = screen.getByLabelText(/^new password$/i)
    await userEvent.type(input, 'short')

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i)
  })

  it('submits successfully, toasts, and navigates home', async () => {
    mockUpdatePasswordAfterReset.mockResolvedValue(undefined)
    renderAt()
    await userEvent.type(screen.getByLabelText(/^new password$/i), 'newPassword123')
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'newPassword123')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => expect(mockUpdatePasswordAfterReset).toHaveBeenCalledWith('newPassword123', 'newPassword123'))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Password updated' })))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'))
  })

  it('surfaces a failed update as a destructive toast, keeping the user on the page', async () => {
    mockUpdatePasswordAfterReset.mockRejectedValue(new Error('Network error'))
    renderAt()
    await userEvent.type(screen.getByLabelText(/^new password$/i), 'newPassword123')
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'newPassword123')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/couldn.t update password/i), variant: 'destructive' })
    ))
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows the expired-link state when redirected back with error_code=otp_expired, not the form', () => {
    renderAt('/reset-password?error_code=otp_expired')
    expect(screen.getByText(/this link expired/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument()
  })

  it('shows a generic link-error state for any other auth error code', () => {
    renderAt('/reset-password?error_code=access_denied')
    expect(screen.getByText(/didn.t work/i)).toBeInTheDocument()
  })

  it('signs out and returns to /login from the expired-link state', async () => {
    renderAt('/reset-password?error_code=otp_expired')
    await userEvent.click(screen.getByRole('button', { name: /back to sign in/i }))
    expect(mockSignOut).toHaveBeenCalled()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'))
  })
})
