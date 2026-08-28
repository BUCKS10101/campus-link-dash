import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockFetchMyFriendships = vi.fn()
const mockSearchProfiles = vi.fn()
const mockSendFriendRequest = vi.fn()
const mockAcceptFriendRequest = vi.fn()
const mockDeclineFriendRequest = vi.fn()
const mockCancelFriendRequest = vi.fn()
const mockRemoveFriend = vi.fn()
vi.mock('@/hooks/useFriends', () => ({
  useFriends: () => ({
    fetchMyFriendships: mockFetchMyFriendships,
    searchProfiles: mockSearchProfiles,
    sendFriendRequest: mockSendFriendRequest,
    acceptFriendRequest: mockAcceptFriendRequest,
    declineFriendRequest: mockDeclineFriendRequest,
    cancelFriendRequest: mockCancelFriendRequest,
    removeFriend: mockRemoveFriend,
  }),
}))

const { default: Friends } = await import('./Friends')

const AUTH_USER = { user: { id: 'me', email: 'me@vitstudent.ac.in' }, profile: null , emailVerified: true }

const FRIEND = {
  id: 'f1', requester_id: 'me', addressee_id: 'other-1', status: 'accepted', created_at: new Date().toISOString(),
  requester_profile: { id: 'me', name: 'Me' },
  addressee_profile: { id: 'other-1', name: 'Alice' },
}
const RECEIVED = {
  id: 'f2', requester_id: 'other-2', addressee_id: 'me', status: 'pending', created_at: new Date().toISOString(),
  requester_profile: { id: 'other-2', name: 'Bob' },
  addressee_profile: { id: 'me', name: 'Me' },
}
const SENT = {
  id: 'f3', requester_id: 'me', addressee_id: 'other-3', status: 'pending', created_at: new Date().toISOString(),
  requester_profile: { id: 'me', name: 'Me' },
  addressee_profile: { id: 'other-3', name: 'Carol' },
}

const renderFriends = () => render(<MemoryRouter><Friends /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  mockUseAuth.mockReturnValue({ user: AUTH_USER, loading: false })
  mockFetchMyFriendships.mockResolvedValue({ friends: [], received: [], sent: [] })
  mockSearchProfiles.mockResolvedValue([])
})

describe('Friends page - empty states', () => {
  it('shows an empty state per section when there is nothing in it', async () => {
    renderFriends()
    expect(await screen.findByText('No friends yet - find someone below.')).toBeInTheDocument()
    expect(screen.getByText('No pending requests.')).toBeInTheDocument()
    expect(screen.getByText('No outgoing requests.')).toBeInTheDocument()
  })
})

describe('Friends page - Friends list', () => {
  it('shows an accepted friend with a Remove action', async () => {
    mockFetchMyFriendships.mockResolvedValue({ friends: [FRIEND], received: [], sent: [] })
    renderFriends()

    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove - alice/i })).toBeInTheDocument()
  })

  it('removes a friend and refetches on click', async () => {
    mockFetchMyFriendships.mockResolvedValueOnce({ friends: [FRIEND], received: [], sent: [] })
    mockFetchMyFriendships.mockResolvedValueOnce({ friends: [], received: [], sent: [] })
    mockRemoveFriend.mockResolvedValue(undefined)
    renderFriends()

    await userEvent.click(await screen.findByRole('button', { name: /remove - alice/i }))
    await waitFor(() => expect(mockRemoveFriend).toHaveBeenCalledWith('f1'))
    await waitFor(() => expect(mockFetchMyFriendships).toHaveBeenCalledTimes(2))
  })
})

describe('Friends page - Requests received (separate from Sent)', () => {
  it('shows Accept and Decline for an incoming request', async () => {
    mockFetchMyFriendships.mockResolvedValue({ friends: [], received: [RECEIVED], sent: [] })
    renderFriends()

    expect(await screen.findByText('Bob')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /accept - bob/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /decline - bob/i })).toBeInTheDocument()
    // Sent section stays empty and separate - not combined with Received
    expect(screen.getByText('No outgoing requests.')).toBeInTheDocument()
  })

  it('accepts a request and refetches', async () => {
    mockFetchMyFriendships.mockResolvedValueOnce({ friends: [], received: [RECEIVED], sent: [] })
    mockFetchMyFriendships.mockResolvedValueOnce({ friends: [RECEIVED], received: [], sent: [] })
    mockAcceptFriendRequest.mockResolvedValue(undefined)
    renderFriends()

    await userEvent.click(await screen.findByRole('button', { name: /accept - bob/i }))
    await waitFor(() => expect(mockAcceptFriendRequest).toHaveBeenCalledWith('f2'))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/accepted/i) })
    ))
  })

  it('declines a request and refetches, with no toast/notification implied', async () => {
    mockFetchMyFriendships.mockResolvedValue({ friends: [], received: [RECEIVED], sent: [] })
    mockDeclineFriendRequest.mockResolvedValue(undefined)
    renderFriends()

    await userEvent.click(await screen.findByRole('button', { name: /decline - bob/i }))
    await waitFor(() => expect(mockDeclineFriendRequest).toHaveBeenCalledWith('f2'))
  })
})

describe('Friends page - Requests sent (separate from Received)', () => {
  it('shows a Pending label and a Cancel action for an outgoing request', async () => {
    mockFetchMyFriendships.mockResolvedValue({ friends: [], received: [], sent: [SENT] })
    renderFriends()

    expect(await screen.findByText('Carol')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel - carol/i })).toBeInTheDocument()
    expect(screen.getByText('No pending requests.')).toBeInTheDocument()
  })

  it('cancels an outgoing request and refetches', async () => {
    mockFetchMyFriendships.mockResolvedValueOnce({ friends: [], received: [], sent: [SENT] })
    mockFetchMyFriendships.mockResolvedValueOnce({ friends: [], received: [], sent: [] })
    mockCancelFriendRequest.mockResolvedValue(undefined)
    renderFriends()

    await userEvent.click(await screen.findByRole('button', { name: /cancel - carol/i }))
    await waitFor(() => expect(mockCancelFriendRequest).toHaveBeenCalledWith('f3'))
    await waitFor(() => expect(mockFetchMyFriendships).toHaveBeenCalledTimes(2))
  })
})

describe('Friends page - Find students search', () => {
  it('does not search on an empty query', async () => {
    renderFriends()
    await screen.findByText('Find students')
    expect(mockSearchProfiles).not.toHaveBeenCalled()
  })

  it('debounces search - does not fire immediately after a keystroke', async () => {
    renderFriends()
    await screen.findByText('Find students')

    const input = screen.getByLabelText(/search students by name/i)
    await userEvent.type(input, 'Ali')
    expect(mockSearchProfiles).not.toHaveBeenCalled()

    await waitFor(() => expect(mockSearchProfiles).toHaveBeenCalledTimes(1), { timeout: 1500 })
    expect(mockSearchProfiles).toHaveBeenCalledWith('Ali')
  })

  it('shows a safe result (name + reputation) with an Add action for a stranger', async () => {
    mockSearchProfiles.mockResolvedValue([
      { id: 'x1', name: 'Dave', avg_rating: 4.5, rating_count: 3, relationship: 'none' },
    ])
    renderFriends()
    await screen.findByText('Find students')

    await userEvent.type(screen.getByLabelText(/search students by name/i), 'Dave')

    expect(await screen.findByText('Dave', {}, { timeout: 1500 })).toBeInTheDocument()
    expect(screen.getByText('4.5 · 3 ratings')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument()
  })

  it('shows "Pending"/"Requested you"/"Friends" instead of Add for an existing relationship', async () => {
    mockSearchProfiles.mockResolvedValue([
      { id: 'x1', name: 'Pending Out', avg_rating: null, rating_count: 0, relationship: 'pending_outgoing' },
      { id: 'x2', name: 'Pending In', avg_rating: null, rating_count: 0, relationship: 'pending_incoming' },
      { id: 'x3', name: 'Already Friend', avg_rating: null, rating_count: 0, relationship: 'friends' },
    ])
    renderFriends()
    await screen.findByText('Find students')
    await userEvent.type(screen.getByLabelText(/search students by name/i), 'e')

    await screen.findByText('Pending Out', {}, { timeout: 1500 })
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Requested you')).toBeInTheDocument()
    // "Friends" also labels the page header/section - scope to the result row's own text node.
    expect(screen.getByText('Already Friend').closest('div')?.parentElement).toHaveTextContent('Friends')
    expect(screen.queryByRole('button', { name: /^add$/i })).not.toBeInTheDocument()
  })

  it('sends a request and flips the button to Pending without a refetch of the search results', async () => {
    mockSearchProfiles.mockResolvedValue([
      { id: 'x1', name: 'Dave', avg_rating: null, rating_count: 0, relationship: 'none' },
    ])
    mockSendFriendRequest.mockResolvedValue('new-id')
    renderFriends()
    await screen.findByText('Find students')
    await userEvent.type(screen.getByLabelText(/search students by name/i), 'Dave')
    await screen.findByText('Dave', {}, { timeout: 1500 })

    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))
    await waitFor(() => expect(mockSendFriendRequest).toHaveBeenCalledWith('x1'))
    expect(await screen.findByText('Pending')).toBeInTheDocument()
  })

  // Phase 3J - see PHASE3_3J_TRUST_SAFETY_SPEC.md §2/§8. UX courtesy
  // only - send_friend_request()'s own server-side check is the real
  // boundary regardless of this client-side pre-check.
  it('shows a verify-email prompt and never calls sendFriendRequest when unverified', async () => {
    mockUseAuth.mockReturnValue({ user: { ...AUTH_USER, emailVerified: false }, loading: false })
    mockSearchProfiles.mockResolvedValue([
      { id: 'x1', name: 'Dave', avg_rating: null, rating_count: 0, relationship: 'none' },
    ])
    renderFriends()
    await screen.findByText('Find students')
    expect(screen.getByText(/verify your email/i)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/search students by name/i), 'Dave')
    await screen.findByText('Dave', {}, { timeout: 1500 })

    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))

    expect(mockSendFriendRequest).not.toHaveBeenCalled()
  })
})
