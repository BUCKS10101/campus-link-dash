import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'

const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const renderAt = (initialPath: string) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/verify-email" element={<div>Verify Email Page</div>} />
        <Route
          element={
            <ProtectedRoute>
              <Routes>
                <Route path="/" element={<div>Home Page</div>} />
                <Route path="/post-request" element={<div>Post Request Page</div>} />
                <Route path="/friends" element={<div>Friends Page</div>} />
              </Routes>
            </ProtectedRoute>
          }
        >
          <Route path="/" element={null} />
          <Route path="/post-request" element={null} />
          <Route path="/friends" element={null} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProtectedRoute', () => {
  it('shows a loading state while auth is still resolving', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true })
    renderAt('/')
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('redirects a signed-out visitor to /login', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    renderAt('/')
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('lets a verified user through to any route, including /post-request', () => {
    mockUseAuth.mockReturnValue({ user: { user: { id: 'u1' }, emailVerified: true }, loading: false })
    renderAt('/post-request')
    expect(screen.getByText('Post Request Page')).toBeInTheDocument()
  })

  it('lets an unverified user browse Home - not a hard wall', () => {
    mockUseAuth.mockReturnValue({ user: { user: { id: 'u1' }, emailVerified: false }, loading: false })
    renderAt('/')
    expect(screen.getByText('Home Page')).toBeInTheDocument()
  })

  it('lets an unverified user browse Friends - viewing/responding stays allowed', () => {
    mockUseAuth.mockReturnValue({ user: { user: { id: 'u1' }, emailVerified: false }, loading: false })
    renderAt('/friends')
    expect(screen.getByText('Friends Page')).toBeInTheDocument()
  })

  it('redirects an unverified user away from /post-request to /verify-email', () => {
    mockUseAuth.mockReturnValue({ user: { user: { id: 'u1' }, emailVerified: false }, loading: false })
    renderAt('/post-request')
    expect(screen.getByText('Verify Email Page')).toBeInTheDocument()
    expect(screen.queryByText('Post Request Page')).not.toBeInTheDocument()
  })
})
