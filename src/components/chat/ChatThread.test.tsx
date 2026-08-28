import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockSendMessage = vi.fn()
const mockRefetch = vi.fn()
const mockUseChat = vi.fn()
vi.mock('@/hooks/useChat', () => ({
  useChat: (orderId: string) => mockUseChat(orderId),
}))

const mockMarkOrderChatRead = vi.fn()
vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    loading: false,
    hasMore: false,
    loadMore: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    markOrderChatRead: mockMarkOrderChatRead,
  }),
}))

const { ChatThread } = await import('./ChatThread')

const MESSAGE_FROM_ME = {
  id: 'm1', order_id: 'order-1', sender_id: 'me', message: 'On my way!', created_at: new Date().toISOString(),
  sender_profile: { id: 'me', name: 'Me' },
}
const MESSAGE_FROM_THEM = {
  id: 'm2', order_id: 'order-1', sender_id: 'them', message: 'Great, thanks!', created_at: new Date().toISOString(),
  sender_profile: { id: 'them', name: 'Priya' },
}

const chatReturn = (overrides = {}) => ({
  messages: [],
  loading: false,
  error: null,
  sendMessage: mockSendMessage,
  refetch: mockRefetch,
  ...overrides,
})

const renderThread = (props = {}) =>
  render(
    <ChatThread
      orderId="order-1"
      currentUserId="me"
      counterpartName="Priya"
      contextLine="DC Cafe → Men's Hostel K"
      {...props}
    />
  )

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ChatThread', () => {
  it('shows a tailored skeleton while loading, not a generic spinner', () => {
    mockUseChat.mockReturnValue(chatReturn({ loading: true }))
    renderThread()
    expect(screen.getByRole('log')).toBeInTheDocument()
    expect(screen.queryByText(/say hello/i)).not.toBeInTheDocument()
  })

  it('shows a contextual empty state naming the counterpart, not a generic message', () => {
    mockUseChat.mockReturnValue(chatReturn())
    renderThread()
    expect(screen.getByText(/this is your line to priya/i)).toBeInTheDocument()
  })

  it('falls back to a role-neutral empty state when there is no counterpart yet', () => {
    mockUseChat.mockReturnValue(chatReturn())
    renderThread({ counterpartName: null })
    expect(screen.getByText(/whoever takes this run/i)).toBeInTheDocument()
  })

  it('shows a human error with a working retry action', async () => {
    mockUseChat.mockReturnValue(chatReturn({ error: 'Failed to load messages' }))
    renderThread()

    expect(screen.getByText(/failed to load messages/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  it('renders messages with a visible distinction between self and other, beyond color alone', () => {
    mockUseChat.mockReturnValue(chatReturn({ messages: [MESSAGE_FROM_THEM, MESSAGE_FROM_ME] }))
    renderThread()

    // The other person's name labels their message; mine doesn't repeat "Me".
    expect(screen.getByText('Priya')).toBeInTheDocument()
    expect(screen.queryByText('Me')).not.toBeInTheDocument()
    expect(screen.getByText('Great, thanks!')).toBeInTheDocument()
    expect(screen.getByText('On my way!')).toBeInTheDocument()
  })

  it('shows the order context line so the conversation is never ambiguous about which order it belongs to', () => {
    mockUseChat.mockReturnValue(chatReturn())
    renderThread()
    expect(screen.getByText("DC Cafe → Men's Hostel K")).toBeInTheDocument()
  })

  it('sends a message and clears the composer on success', async () => {
    mockSendMessage.mockResolvedValue({ id: 'm3' })
    mockUseChat.mockReturnValue(chatReturn())
    renderThread()

    const input = screen.getByLabelText('Message')
    await userEvent.type(input, 'hello there')
    await userEvent.click(screen.getByRole('button', { name: /^send$/i }))

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith('hello there', 'me'))
    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('disables Send while a message is in flight and never double-submits', async () => {
    let resolveSend: (v: unknown) => void
    mockSendMessage.mockReturnValue(new Promise((resolve) => { resolveSend = resolve }))
    mockUseChat.mockReturnValue(chatReturn())
    renderThread()

    const input = screen.getByLabelText('Message')
    await userEvent.type(input, 'hello')
    const sendButton = screen.getByRole('button', { name: /^send$/i })
    await userEvent.click(sendButton)

    expect(sendButton).toBeDisabled()
    await userEvent.click(sendButton) // no-op while sending

    resolveSend!({ id: 'm4' })
    // The composer clears on success, so Send is disabled again - correctly,
    // there's nothing left to send - not because it's stuck loading.
    await waitFor(() => expect(input).toHaveValue(''))
    expect(sendButton).not.toHaveAttribute('aria-busy', 'true')
    expect(mockSendMessage).toHaveBeenCalledTimes(1)

    // Recovery: the composer works again for a second message.
    await userEvent.type(input, 'second message')
    expect(sendButton).toBeEnabled()
  })

  it('preserves the draft when sending fails, instead of wiping it', async () => {
    mockSendMessage.mockRejectedValue(new Error('Network error'))
    mockUseChat.mockReturnValue(chatReturn())
    renderThread()

    const input = screen.getByLabelText('Message')
    await userEvent.type(input, 'do not lose this')
    await userEvent.click(screen.getByRole('button', { name: /^send$/i }))

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalled())
    expect(input).toHaveValue('do not lose this')
  })

  it('never sends a blank or whitespace-only message', async () => {
    mockUseChat.mockReturnValue(chatReturn())
    renderThread()

    const input = screen.getByLabelText('Message')
    await userEvent.type(input, '   ')
    expect(screen.getByRole('button', { name: /^send$/i })).toBeDisabled()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('marks this order\'s chat notification read on mount - opening the thread is handling it', () => {
    mockUseChat.mockReturnValue(chatReturn())
    renderThread()
    expect(mockMarkOrderChatRead).toHaveBeenCalledWith('order-1')
  })

  it('marks it read again when a new message arrives while the thread stays open', () => {
    mockUseChat.mockReturnValue(chatReturn({ messages: [MESSAGE_FROM_ME] }))
    const { rerender } = render(
      <ChatThread orderId="order-1" currentUserId="me" counterpartName="Priya" contextLine="DC Cafe → Men's Hostel K" />
    )
    const callsAfterMount = mockMarkOrderChatRead.mock.calls.length

    mockUseChat.mockReturnValue(chatReturn({ messages: [MESSAGE_FROM_ME, MESSAGE_FROM_THEM] }))
    rerender(
      <ChatThread orderId="order-1" currentUserId="me" counterpartName="Priya" contextLine="DC Cafe → Men's Hostel K" />
    )

    expect(mockMarkOrderChatRead.mock.calls.length).toBeGreaterThan(callsAfterMount)
  })

  // Phase 3J - see PHASE3_3J_TRUST_SAFETY_SPEC.md §2/§8.
  describe('emailVerified gating (Phase 3J)', () => {
    it('defaults to fully interactive when emailVerified is omitted', () => {
      mockUseChat.mockReturnValue(chatReturn())
      renderThread()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('shows an inline verify-email message and disables Send when unverified', async () => {
      mockUseChat.mockReturnValue(chatReturn())
      renderThread({ emailVerified: false })

      expect(screen.getByRole('alert')).toHaveTextContent(/verify your email/i)
      await userEvent.type(screen.getByPlaceholderText('Message…'), 'hello')
      expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('stays fully interactive when explicitly verified', () => {
      mockUseChat.mockReturnValue(chatReturn())
      renderThread({ emailVerified: true })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
