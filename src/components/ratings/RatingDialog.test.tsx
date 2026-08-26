import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockSubmitRating = vi.fn()
vi.mock('@/hooks/useRatings', () => ({
  useRatings: () => ({ submitRating: mockSubmitRating }),
}))

const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const { RatingDialog } = await import('./RatingDialog')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RatingDialog', () => {
  it('opens with no star selected and Submit disabled', async () => {
    render(<RatingDialog orderId="order-1" counterpartName="Priya" onSubmitted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /rate this delivery/i }))

    expect(screen.getByText('How did it go?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^submit$/i })).toBeDisabled()
  })

  it('names the counterpart being rated', async () => {
    render(<RatingDialog orderId="order-1" counterpartName="Priya" onSubmitted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /rate this delivery/i }))

    expect(screen.getByText('Rating Priya')).toBeInTheDocument()
  })

  it('enables Submit once a star is picked, and submits score + comment', async () => {
    mockSubmitRating.mockResolvedValue(undefined)
    const onSubmitted = vi.fn()
    render(<RatingDialog orderId="order-1" counterpartName="Priya" onSubmitted={onSubmitted} />)
    await userEvent.click(screen.getByRole('button', { name: /rate this delivery/i }))

    await userEvent.click(screen.getByRole('radio', { name: '4 stars' }))
    expect(screen.getByRole('button', { name: /^submit$/i })).toBeEnabled()

    await userEvent.type(screen.getByLabelText(/comment/i), 'Very careful with the order')
    await userEvent.click(screen.getByRole('button', { name: /^submit$/i }))

    await waitFor(() => expect(mockSubmitRating).toHaveBeenCalledWith('order-1', 4, 'Very careful with the order'))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith('order-1'))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/recorded/i) })
    ))
  })

  it('closes the dialog after a successful submit', async () => {
    mockSubmitRating.mockResolvedValue(undefined)
    render(<RatingDialog orderId="order-1" counterpartName="Priya" onSubmitted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /rate this delivery/i }))
    await userEvent.click(screen.getByRole('radio', { name: '5 stars' }))
    await userEvent.click(screen.getByRole('button', { name: /^submit$/i }))

    await waitFor(() => expect(screen.queryByText('How did it go?')).not.toBeInTheDocument())
  })

  it('shows an error toast and keeps the dialog open when the server rejects the rating', async () => {
    mockSubmitRating.mockRejectedValue(new Error('You already rated this order'))
    render(<RatingDialog orderId="order-1" counterpartName="Priya" onSubmitted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /rate this delivery/i }))
    await userEvent.click(screen.getByRole('radio', { name: '3 stars' }))
    await userEvent.click(screen.getByRole('button', { name: /^submit$/i }))

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/couldn.t submit/i) })
    ))
    expect(screen.getByText('How did it go?')).toBeInTheDocument()
  })

  it('resets the star selection each time the dialog is reopened', async () => {
    mockSubmitRating.mockResolvedValue(undefined)
    render(<RatingDialog orderId="order-1" counterpartName="Priya" onSubmitted={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /rate this delivery/i }))
    await userEvent.click(screen.getByRole('radio', { name: '2 stars' }))
    await userEvent.keyboard('{Escape}')

    await userEvent.click(screen.getByRole('button', { name: /rate this delivery/i }))
    expect(screen.getByRole('radio', { name: '2 stars' })).toHaveAttribute('aria-checked', 'false')
  })
})
