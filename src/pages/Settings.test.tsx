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

const { default: Settings } = await import('./Settings')

const AUTH_USER = {
  user: { id: 'user-1', email: 'jane@vitstudent.ac.in' },
  profile: { id: 'user-1', name: 'Jane Doe', email: 'jane@vitstudent.ac.in', phone: '9876543210' },
}

const renderSettings = () => render(<MemoryRouter><Settings /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ user: AUTH_USER, signOut: mockSignOut, changePassword: mockChangePassword })
  mockUseTheme.mockReturnValue({ theme: 'light', setTheme: mockSetTheme })
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
    expect(screen.queryByText(/notification/i)).not.toBeInTheDocument()
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
