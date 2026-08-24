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

const { default: MyOrders } = await import('./MyOrders')

const AUTH_USER = { user: { id: 'customer-1', email: 'a@b.com' }, profile: null }

// Matches the live schema: requester_id (not customer_id), items/
// delivery_location as jsonb (not items_description/pickup_location as
// strings), requester_profile keyed off orders_requester_id_fkey (not
// customer_profile), no price/restaurant_icon columns.
const CUSTOMER_ORDER = {
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

const renderMyOrders = () => render(<MemoryRouter><MyOrders /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ user: AUTH_USER, loading: false, signOut: vi.fn() })
})

describe('MyOrders', () => {
  it('shows a loading state while orders are being fetched', () => {
    mockUseOrders.mockReturnValue({
      orders: [], loading: true, error: null, fetchOrders: mockFetchOrders,
      updateOrderStatus: mockUpdateOrderStatus, getMyOrderOtp: mockGetMyOrderOtp, verifyDeliveryOtp: mockVerifyDeliveryOtp,
    })

    const { container } = renderMyOrders()
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows an error state with a retry action', async () => {
    mockUseOrders.mockReturnValue({
      orders: [], loading: false, error: 'Network error', fetchOrders: mockFetchOrders,
      updateOrderStatus: mockUpdateOrderStatus, getMyOrderOtp: mockGetMyOrderOtp, verifyDeliveryOtp: mockVerifyDeliveryOtp,
    })

    renderMyOrders()

    expect(screen.getByText(/couldn't load your orders/i)).toBeInTheDocument()
    expect(screen.getByText(/network error/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(mockFetchOrders).toHaveBeenCalled()
  })

  it('shows an empty state when the user has no orders', () => {
    mockUseOrders.mockReturnValue({
      orders: [], loading: false, error: null, fetchOrders: mockFetchOrders,
      updateOrderStatus: mockUpdateOrderStatus, getMyOrderOtp: mockGetMyOrderOtp, verifyDeliveryOtp: mockVerifyDeliveryOtp,
    })

    renderMyOrders()
    expect(screen.getByText(/no orders yet/i)).toBeInTheDocument()
  })

  it('renders real order data (items/delivery_location jsonb, requester_profile) instead of the old hardcoded mock order', () => {
    mockUseOrders.mockReturnValue({
      orders: [CUSTOMER_ORDER], loading: false, error: null, fetchOrders: mockFetchOrders,
      updateOrderStatus: mockUpdateOrderStatus, getMyOrderOtp: mockGetMyOrderOtp, verifyDeliveryOtp: mockVerifyDeliveryOtp,
    })
    mockGetMyOrderOtp.mockResolvedValue('123456')

    renderMyOrders()

    expect(screen.getAllByText('One Food').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2x Burger').length).toBeGreaterThan(0)
    expect(screen.getAllByText("Men's Hostel K").length).toBeGreaterThan(0)
    expect(screen.getAllByText('Deliverer Name').length).toBeGreaterThan(0)
    // No price shown - orders has no price column, and the old component
    // hardcoded "Arjun Kumar" - make sure both are gone.
    expect(screen.queryByText(/₹0/)).not.toBeInTheDocument()
    expect(screen.queryByText(/arjun/i)).not.toBeInTheDocument()
  })

  it('shows the customer their real OTP fetched from the backend', async () => {
    mockUseOrders.mockReturnValue({
      orders: [CUSTOMER_ORDER], loading: false, error: null, fetchOrders: mockFetchOrders,
      updateOrderStatus: mockUpdateOrderStatus, getMyOrderOtp: mockGetMyOrderOtp, verifyDeliveryOtp: mockVerifyDeliveryOtp,
    })
    mockGetMyOrderOtp.mockResolvedValue('123456')

    renderMyOrders()

    expect(mockGetMyOrderOtp).toHaveBeenCalledWith('order-1')
    await waitFor(() => expect(screen.getAllByText('1').length).toBeGreaterThan(0))
  })

  it('lets the deliverer submit an OTP and shows a failure message on an incorrect code', async () => {
    mockUseAuth.mockReturnValue({ user: { user: { id: 'deliverer-1' }, profile: null }, loading: false, signOut: vi.fn() })
    mockUseOrders.mockReturnValue({
      orders: [CUSTOMER_ORDER], loading: false, error: null, fetchOrders: mockFetchOrders,
      updateOrderStatus: mockUpdateOrderStatus, getMyOrderOtp: mockGetMyOrderOtp, verifyDeliveryOtp: mockVerifyDeliveryOtp,
    })
    mockVerifyDeliveryOtp.mockResolvedValue(false)

    renderMyOrders()

    const [input] = screen.getAllByPlaceholderText('000000')
    await userEvent.type(input, '999999')
    const [verifyButton] = screen.getAllByRole('button', { name: /verify & complete delivery/i })
    await userEvent.click(verifyButton)

    await waitFor(() => expect(mockVerifyDeliveryOtp).toHaveBeenCalledWith('order-1', '999999'))
    expect(await screen.findByText(/incorrect code/i)).toBeInTheDocument()
  })

  it('lets the deliverer complete delivery on a correct OTP', async () => {
    mockUseAuth.mockReturnValue({ user: { user: { id: 'deliverer-1' }, profile: null }, loading: false, signOut: vi.fn() })
    mockUseOrders.mockReturnValue({
      orders: [CUSTOMER_ORDER], loading: false, error: null, fetchOrders: mockFetchOrders,
      updateOrderStatus: mockUpdateOrderStatus, getMyOrderOtp: mockGetMyOrderOtp, verifyDeliveryOtp: mockVerifyDeliveryOtp,
    })
    mockVerifyDeliveryOtp.mockResolvedValue(true)

    renderMyOrders()

    const [input] = screen.getAllByPlaceholderText('000000')
    await userEvent.type(input, '123456')
    const [verifyButton] = screen.getAllByRole('button', { name: /verify & complete delivery/i })
    await userEvent.click(verifyButton)

    await waitFor(() => expect(mockVerifyDeliveryOtp).toHaveBeenCalledWith('order-1', '123456'))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/delivery confirmed/i) })
    ))
    // The component refetches on success, it never sets status client-side.
    expect(mockFetchOrders).toHaveBeenCalled()
  })

  it('sends a chat message without a sender_type argument', async () => {
    mockUseOrders.mockReturnValue({
      orders: [CUSTOMER_ORDER], loading: false, error: null, fetchOrders: mockFetchOrders,
      updateOrderStatus: mockUpdateOrderStatus, getMyOrderOtp: mockGetMyOrderOtp, verifyDeliveryOtp: mockVerifyDeliveryOtp,
    })
    mockGetMyOrderOtp.mockResolvedValue('123456')
    mockSendMessage.mockResolvedValue({ id: 'm1' })

    renderMyOrders()

    const [messageInput] = screen.getAllByPlaceholderText('Type your message...')
    await userEvent.type(messageInput, 'On my way!')
    const [sendButton] = screen.getAllByRole('button', { name: /^send$/i })
    await userEvent.click(sendButton)

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith('On my way!', 'customer-1'))
  })
})
