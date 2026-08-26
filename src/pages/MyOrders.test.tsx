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

const mockFetchOrders = vi.fn()
const mockUpdateOrderStatus = vi.fn()
const mockGetMyOrderOtp = vi.fn()
const mockVerifyDeliveryOtp = vi.fn()
const mockUseOrders = vi.fn()
vi.mock('@/hooks/useOrders', () => ({
  useOrders: () => mockUseOrders(),
}))

const mockSendMessage = vi.fn()
vi.mock('@/hooks/useChat', () => ({
  useChat: () => ({ messages: [], loading: false, error: null, sendMessage: mockSendMessage }),
}))

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    loading: false,
    hasMore: false,
    loadMore: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    markOrderChatRead: vi.fn(),
  }),
}))

const { default: MyOrders } = await import('./MyOrders')

const AUTH_USER = { user: { id: 'customer-1', email: 'a@b.com' }, profile: null }

const REQUESTED_ORDER = {
  id: 'order-1',
  requester_id: 'customer-1',
  deliverer_id: 'deliverer-1',
  restaurant_name: 'One Food',
  items: ['2x Burger'],
  tip_amount: 30,
  delivery_location: { type: 'hostel', label: "Men's Hostel K", hostelType: 'mens', block: 'K' },
  distance_km: 1.2,
  status: 'picked_up',
  created_at: new Date().toISOString(),
  requester_profile: { id: 'customer-1', name: 'Customer Name', phone: '9999999999' },
  deliverer_profile: { id: 'deliverer-1', name: 'Deliverer Name', phone: '8888888888' },
}

const CARRYING_ORDER = {
  ...REQUESTED_ORDER,
  id: 'order-2',
  requester_id: 'other-requester',
  deliverer_id: 'customer-1',
  status: 'accepted',
  restaurant_name: 'DC Cafe',
  items: ['1x Cold Coffee'],
  delivery_location: { type: 'hostel', label: "Ladies Hostel C", hostelType: 'ladies', block: 'C' },
  requester_profile: { id: 'other-requester', name: 'Other Requester', phone: '7777777777' },
  deliverer_profile: { id: 'customer-1', name: 'Customer Name', phone: '9999999999' },
}

const CARRYING_ORDER_PICKED_UP = { ...CARRYING_ORDER, status: 'picked_up' }

const useOrdersReturn = (overrides = {}) => ({
  orders: [], loading: false, error: null, fetchOrders: mockFetchOrders,
  updateOrderStatus: mockUpdateOrderStatus, getMyOrderOtp: mockGetMyOrderOtp, verifyDeliveryOtp: mockVerifyDeliveryOtp,
  ...overrides,
})

const renderMyOrders = () => render(<MemoryRouter><MyOrders /></MemoryRouter>)

/** The OTP reveal renders each digit as its own animated span, so the
 * spaced code is spread across sibling elements rather than one text
 * node - read it back via the status region's full text content instead
 * of matching a single element. */
const otpSlipText = () => screen.getByRole('status').textContent?.trim()

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ user: AUTH_USER, loading: false, signOut: vi.fn() })
})

describe('MyOrders / Activity', () => {
  it('shows a loading state while orders are being fetched', () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ loading: true }))
    renderMyOrders()
    expect(screen.getByText(/loading activity/i)).toBeInTheDocument()
  })

  it('shows an error state with a retry action', async () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ error: 'Network error' }))
    renderMyOrders()

    expect(screen.getByText(/couldn't load your activity/i)).toBeInTheDocument()
    expect(screen.getByText(/network error/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(mockFetchOrders).toHaveBeenCalled()
  })

  it('shows an empty state when the user has no orders in either role', () => {
    mockUseOrders.mockReturnValue(useOrdersReturn())
    renderMyOrders()
    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument()
  })

  it('shows both lanes, each independently, when the user is requesting AND delivering at once', () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [REQUESTED_ORDER, CARRYING_ORDER] }))
    mockGetMyOrderOtp.mockResolvedValue('123456')
    renderMyOrders()

    expect(screen.getByText(/you asked for/i)).toBeInTheDocument()
    expect(screen.getByText(/you're carrying/i)).toBeInTheDocument()

    // requester lane: this order's real fields, not the old hardcoded mock.
    // "One Food" / "Men's Hostel K" now appear twice by design - once in the
    // row header, once in ChatThread's own order-context line.
    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    expect(screen.getAllByText(/One Food/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Men's Hostel K/).length).toBeGreaterThan(0)
    expect(screen.getByText('Deliverer Name')).toBeInTheDocument()

    // deliverer lane: a different order, different counterpart
    expect(screen.getByText('Other Requester')).toBeInTheDocument()

    expect(screen.queryByText(/arjun/i)).not.toBeInTheDocument()
  })

  it("shows 'Nothing active' for whichever lane has no order in that role", () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [REQUESTED_ORDER] }))
    mockGetMyOrderOtp.mockResolvedValue('123456')
    renderMyOrders()

    expect(screen.getByText(/you're carrying/i)).toBeInTheDocument()
    expect(screen.getAllByText(/nothing active/i).length).toBeGreaterThan(0)
  })

  it('shows the requester their real OTP fetched from the backend', async () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [REQUESTED_ORDER] }))
    mockGetMyOrderOtp.mockResolvedValue('123456')
    renderMyOrders()

    expect(mockGetMyOrderOtp).toHaveBeenCalledWith('order-1')
    await waitFor(() => expect(otpSlipText()).toBe('1 2 3 4 5 6'))
  })

  it('lets the deliverer submit an OTP and shows a failure message on an incorrect code', async () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [CARRYING_ORDER_PICKED_UP] }))
    mockVerifyDeliveryOtp.mockResolvedValue(false)
    renderMyOrders()

    const input = screen.getByLabelText(/delivery code/i)
    await userEvent.type(input, '999999')
    await userEvent.click(screen.getByRole('button', { name: /confirm delivery/i }))

    await waitFor(() => expect(mockVerifyDeliveryOtp).toHaveBeenCalledWith('order-2', '999999'))
    expect(await screen.findByText(/incorrect code/i)).toBeInTheDocument()
  })

  it('lets the deliverer complete delivery on a correct OTP', async () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [CARRYING_ORDER_PICKED_UP] }))
    mockVerifyDeliveryOtp.mockResolvedValue(true)
    renderMyOrders()

    const input = screen.getByLabelText(/delivery code/i)
    await userEvent.type(input, '123456')
    await userEvent.click(screen.getByRole('button', { name: /confirm delivery/i }))

    await waitFor(() => expect(mockVerifyDeliveryOtp).toHaveBeenCalledWith('order-2', '123456'))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/delivered/i) })
    ))
    expect(mockFetchOrders).toHaveBeenCalled()
  })

  it('deliverer can advance a non-OTP status transition', async () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [CARRYING_ORDER] }))
    mockUpdateOrderStatus.mockResolvedValue({ ...CARRYING_ORDER, status: 'picked_up' })
    renderMyOrders()

    await userEvent.click(screen.getByRole('button', { name: /mark picked up/i }))
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-2', 'picked_up', 'customer-1')
  })

  it('sends a chat message without a sender_type argument', async () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [REQUESTED_ORDER] }))
    mockGetMyOrderOtp.mockResolvedValue('123456')
    mockSendMessage.mockResolvedValue({ id: 'm1' })
    renderMyOrders()

    const messageInput = screen.getByPlaceholderText('Message…')
    await userEvent.type(messageInput, 'On my way!')
    await userEvent.click(screen.getByRole('button', { name: /^send$/i }))

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith('On my way!', 'customer-1'))
  })

  it('shows past orders under Earlier', () => {
    const delivered = { ...REQUESTED_ORDER, id: 'order-3', status: 'delivered' }
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [delivered] }))
    renderMyOrders()

    expect(screen.getByText(/earlier/i)).toBeInTheDocument()
    expect(screen.queryByText(/nothing yet/i)).not.toBeInTheDocument()
  })

  it('tags each past order with the role it was held in', () => {
    const askedPast = { ...REQUESTED_ORDER, id: 'order-3', status: 'delivered' }
    const carriedPast = { ...CARRYING_ORDER, id: 'order-4', status: 'delivered' }
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [askedPast, carriedPast] }))
    renderMyOrders()

    expect(screen.getByText(/^Asked ·/)).toBeInTheDocument()
    expect(screen.getByText(/^Carried ·/)).toBeInTheDocument()
  })
})

describe('MyOrders / Activity - editorial headline', () => {
  it('reflects real counts when both roles are active at once', () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [REQUESTED_ORDER, CARRYING_ORDER] }))
    mockGetMyOrderOtp.mockResolvedValue('123456')
    renderMyOrders()

    expect(screen.getByText(/asking and carrying at once/i)).toBeInTheDocument()
    expect(screen.getByText('1 asked for · 1 carrying')).toBeInTheDocument()
  })

  it('says nothing needs attention when there is only history', () => {
    const delivered = { ...REQUESTED_ORDER, id: 'order-3', status: 'delivered' }
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [delivered] }))
    renderMyOrders()

    expect(screen.getByText(/nothing needs you right now/i)).toBeInTheDocument()
  })
})

describe('MyOrders / Activity - empty lane CTAs', () => {
  it('offers to post a request when the asked-for lane is empty', () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [CARRYING_ORDER] }))
    mockGetMyOrderOtp.mockResolvedValue('123456')
    renderMyOrders()

    const postLink = screen.getByRole('link', { name: /post a request/i })
    expect(postLink).toHaveAttribute('href', '/post-request')
  })

  it('offers to browse the board when the carrying lane is empty', () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [REQUESTED_ORDER] }))
    mockGetMyOrderOtp.mockResolvedValue('123456')
    renderMyOrders()

    const browseLink = screen.getByRole('link', { name: /browse the board/i })
    expect(browseLink).toHaveAttribute('href', '/')
  })
})

describe('MyOrders / Activity - multiple active orders in one lane', () => {
  const SECOND_REQUESTED_ORDER = {
    ...REQUESTED_ORDER,
    id: 'order-5',
    status: 'pending',
    deliverer_id: null,
    deliverer_profile: null,
    restaurant_name: 'Campus Store',
    items: ['1x notebook'],
  }

  it('shows every active order as its own row, with only one expanded by default', async () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [REQUESTED_ORDER, SECOND_REQUESTED_ORDER] }))
    mockGetMyOrderOtp.mockResolvedValue('123456')
    renderMyOrders()

    // Both rows are listed...
    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    expect(screen.getByText('1x notebook')).toBeInTheDocument()
    // ...the lane count reflects both...
    expect(screen.getByText('2')).toBeInTheDocument()
    // ...but only the first (picked_up) order's OTP fetch has fired - the
    // second row's detail, including its OTP/chat, isn't mounted yet.
    await waitFor(() => expect(mockGetMyOrderOtp).toHaveBeenCalledTimes(1))
  })

  it('expands a collapsed row on click and collapses the previously-open one', async () => {
    mockUseOrders.mockReturnValue(useOrdersReturn({ orders: [REQUESTED_ORDER, SECOND_REQUESTED_ORDER] }))
    mockGetMyOrderOtp.mockResolvedValue('123456')
    renderMyOrders()

    await waitFor(() => expect(otpSlipText()).toBe('1 2 3 4 5 6'))

    await userEvent.click(screen.getByText('1x notebook'))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText('Waiting for someone to take it.')).toBeInTheDocument()
  })
})
