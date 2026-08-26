import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockSignIn = vi.fn()
const mockSignUp = vi.fn()
const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const { default: Login } = await import('./Login')

const renderLogin = () => render(<MemoryRouter><Login /></MemoryRouter>)

const fillLogin = async (email: string, password: string) => {
  await userEvent.type(screen.getByLabelText(/email/i), email)
  await userEvent.type(screen.getByLabelText(/password/i), password)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ user: null, signIn: mockSignIn, signUp: mockSignUp })
})

describe('Login', () => {
  it('is interactive on first render — the button is not gated on auth-session loading', () => {
    renderLogin()
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled()
  })

  it('enters a loading state on submit and leaves it once sign-in resolves', async () => {
    let resolveSignIn: (v: unknown) => void
    mockSignIn.mockReturnValue(new Promise((resolve) => { resolveSignIn = resolve }))
    renderLogin()

    await fillLogin('a@vitstudent.ac.in', 'password123')
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeDisabled()

    resolveSignIn!({ user: { id: 'u1' } })
    await waitFor(() => expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled())
  })

  it('leaves the loading state and stays interactive on invalid credentials', async () => {
    mockSignIn.mockRejectedValue(new Error('Invalid login credentials'))
    renderLogin()

    await fillLogin('a@vitstudent.ac.in', 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled())
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/didn't work/i) })
    )
  })

  it('leaves the loading state and stays interactive when sign-in rejects unexpectedly', async () => {
    mockSignIn.mockRejectedValue(new Error('Network request failed'))
    renderLogin()

    await fillLogin('a@vitstudent.ac.in', 'password123')
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled())
  })

  it('does not require a manual navigate — reaches the app once the auth hook reports a user', () => {
    const { rerender } = render(<MemoryRouter><Login /></MemoryRouter>)
    expect(mockNavigate).not.toHaveBeenCalled()

    mockUseAuth.mockReturnValue({ user: { user: { id: 'u1' } }, signIn: mockSignIn, signUp: mockSignUp })
    rerender(<MemoryRouter><Login /></MemoryRouter>)

    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('blocks submission with a toast when required fields are missing, without ever entering a loading state', async () => {
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(mockSignIn).not.toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/missing information/i) })
    )
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled()
  })
})
