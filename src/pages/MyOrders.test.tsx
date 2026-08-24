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

const CUSTOMER_ORDER = {
  id: 'order-1',
  customer_id: 'customer-1',
  deliverer_id: 'deliverer-1',
  restaurant_name: 'One Food',
  restaurant_icon: '🍔',
  items_description: '2x Burger',
  price: 0,
  tip_amount: 30,
  pickup_location: 'One Food',
  delivery_location: "Men's Hostel K",
  distance: 1.2,
  status: 'picked_up',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  completed_at: null,
  customer_profile: { id: 'customer-1', full_name: 'Customer Name', phone: '9999999999' },
  deliverer_profile: { id: 'deliverer-1', full_name: 'Deliverer Name', phone: '8888888888' },
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

  it('renders real order data instead of the old hardcoded mock order', () => {
    mockUseOrders.mockReturnValue({
      orders: [CUSTOMER_ORDER], loading: false, error: null, fetchOrders: mockFetchOrders,
      updateOrderStatus: mockUpdateOrderStatus, getMyOrderOtp: mockGetMyOrderOtp, verifyDeliveryOtp: mockVerifyDeliveryOtp,
    })
    mockGetMyOrderOtp.mockResolvedValue('123456')

    renderMyOrders()

    expect(screen.getAllByText('One Food').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2x Burger').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Deliverer Name').length).toBeGreaterThan(0)
    // The old component hardcoded "Arjun Kumar" - make sure that's gone.
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
})
