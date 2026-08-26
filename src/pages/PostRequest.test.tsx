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

const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockCreateOrder = vi.fn()
vi.mock('@/hooks/useOrders', () => ({
  useOrders: () => ({ createOrder: mockCreateOrder }),
}))

const { default: PostRequest } = await import('./PostRequest')

const AUTH_USER = { user: { id: 'requester-1', email: 'a@vitstudent.ac.in' }, profile: null }

const renderPage = () => render(<MemoryRouter><PostRequest /></MemoryRouter>)

/** Drives the flow from step 1 through to the Review step with valid data. */
const fillThroughToReview = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'One Food' }))
  await user.type(screen.getByLabelText('Items'), '2x Chicken Burger\n1x Coke')
  await user.click(screen.getByRole('button', { name: 'Continue' }))

  await user.click(screen.getByRole('button', { name: 'Hostels' }))
  await user.click(screen.getByRole('button', { name: "Men's" }))
  await user.click(screen.getByRole('button', { name: 'K' }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))

  await user.click(screen.getByRole('button', { name: '₹50' }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ user: AUTH_USER })
})

describe('PostRequest', () => {
  it('starts on step 1 (What) with restaurants and an items field', () => {
    renderPage()
    expect(screen.getByText('1 / 4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'What' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'One Food' })).toBeInTheDocument()
    expect(screen.getByLabelText('Items')).toBeInTheDocument()
  })

  it('blocks advancing from step 1 without a restaurant or items, with a specific message', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByText('1 / 4')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/select where you.re ordering from/i)

    await user.click(screen.getByRole('button', { name: 'One Food' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/add at least one item/i)
  })

  it('advances to step 2 (Where) once restaurant and items are provided', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'One Food' }))
    await user.type(screen.getByLabelText('Items'), '2x Chicken Burger')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByText('2 / 4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Where' })).toBeInTheDocument()
  })

  it('blocks advancing from step 2 until a full location is picked', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'One Food' }))
    await user.type(screen.getByLabelText('Items'), '2x Chicken Burger')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/pick a hostel or a campus location/i)

    await user.click(screen.getByRole('button', { name: 'Hostels' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/pick a hostel and a block/i)
  })

  it('preserves entered data when navigating back', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'One Food' }))
    await user.type(screen.getByLabelText('Items'), '2x Chicken Burger')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByText('1 / 4')).toBeInTheDocument()
    expect(screen.getByLabelText('Items')).toHaveValue('2x Chicken Burger')
    expect(screen.getByRole('button', { name: 'One Food' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('lets a preset set the tip, reflected in the live preview', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'One Food' }))
    await user.type(screen.getByLabelText('Items'), '2x Chicken Burger')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Hostels' }))
    await user.click(screen.getByRole('button', { name: "Men's" }))
    await user.click(screen.getByRole('button', { name: 'K' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await user.click(screen.getByRole('button', { name: '₹75' }))
    expect(screen.getAllByText('₹75').length).toBeGreaterThan(0)
  })

  it('shows a full summary on the Review step', async () => {
    const user = userEvent.setup()
    renderPage()
    await fillThroughToReview(user)

    // The desktop preview panel renders alongside step 4's own content
    // regardless of viewport in jsdom, so both may match - that's expected.
    expect(screen.getByText('4 / 4')).toBeInTheDocument()
    expect(screen.getAllByText('2x Chicken Burger, 1x Coke').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/One Food.*Men's Hostel K/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Post this request' })).toBeInTheDocument()
  })

  it('posts the request with the exact real fields, and shows a completion state', async () => {
    mockCreateOrder.mockResolvedValue({ id: 'order-1' })
    const user = userEvent.setup()
    renderPage()
    await fillThroughToReview(user)

    await user.click(screen.getByRole('button', { name: 'Post this request' }))

    await waitFor(() => expect(mockCreateOrder).toHaveBeenCalledTimes(1))
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        requester_id: 'requester-1',
        deliverer_id: null,
        restaurant_name: 'One Food',
        items: ['2x Chicken Burger', '1x Coke'],
        tip_amount: 50,
        delivery_location: { type: 'hostel', label: "Men's Hostel K", hostelType: 'mens', block: 'K' },
        status: 'pending',
      })
    )

    await waitFor(() => expect(screen.getByText(/it.s on the board/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'View on Activity' })).toBeInTheDocument()
  })

  it('resets loading and stays interactive when posting fails', async () => {
    mockCreateOrder.mockRejectedValue(new Error('Network error'))
    const user = userEvent.setup()
    renderPage()
    await fillThroughToReview(user)

    const postButton = screen.getByRole('button', { name: 'Post this request' })
    await user.click(postButton)

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/couldn.t post it/i) })
    ))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Post this request' })).toBeEnabled())
    expect(screen.getByText('4 / 4')).toBeInTheDocument()
  })

  it('never fires a second create-order call while a submission is already in flight', async () => {
    let resolveCreate: (v: unknown) => void
    mockCreateOrder.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve }))
    const user = userEvent.setup()
    renderPage()
    await fillThroughToReview(user)

    const postButton = screen.getByRole('button', { name: 'Post this request' })
    await user.click(postButton)
    await user.click(postButton) // second click while the first request is still in flight

    resolveCreate!({ id: 'order-1' })
    await waitFor(() => expect(screen.getByText(/it.s on the board/i)).toBeInTheDocument())
    expect(mockCreateOrder).toHaveBeenCalledTimes(1)
  })

  it('resets to step 1 when posting another request', async () => {
    mockCreateOrder.mockResolvedValue({ id: 'order-1' })
    const user = userEvent.setup()
    renderPage()
    await fillThroughToReview(user)
    await user.click(screen.getByRole('button', { name: 'Post this request' }))
    await waitFor(() => expect(screen.getByText(/it.s on the board/i)).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Post another request' }))

    expect(screen.getByText('1 / 4')).toBeInTheDocument()
    expect(screen.getByLabelText('Items')).toHaveValue('')
  })

  it('redirects to login instead of posting when the session is gone', async () => {
    mockUseAuth.mockReturnValue({ user: null })
    const user = userEvent.setup()
    renderPage()
    await fillThroughToReview(user)

    await user.click(screen.getByRole('button', { name: 'Post this request' }))

    expect(mockCreateOrder).not.toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })
})
