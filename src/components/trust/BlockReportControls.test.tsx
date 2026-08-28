import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BlockReportControls } from './BlockReportControls'

const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const mockIsBlocked = vi.fn()
const mockBlockUser = vi.fn()
const mockUnblockUser = vi.fn()
vi.mock('@/hooks/useBlocks', () => ({
  useBlocks: () => ({ isBlocked: mockIsBlocked, blockUser: mockBlockUser, unblockUser: mockUnblockUser, loading: false }),
}))

const mockFileReport = vi.fn()
vi.mock('@/hooks/useReports', () => ({
  useReports: () => ({ fileReport: mockFileReport, loading: false }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockIsBlocked.mockResolvedValue(false)
})

describe('BlockReportControls', () => {
  it('shows "Block" for a not-yet-blocked counterpart, and switches to "Unblock" after confirming', async () => {
    mockBlockUser.mockResolvedValue(undefined)
    render(<BlockReportControls targetUserId="other-1" targetName="Alice" orderId="order-1" />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Block Alice' })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Block Alice' }))
    await userEvent.click(screen.getByRole('button', { name: 'Block' }))

    expect(mockBlockUser).toHaveBeenCalledWith('other-1')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unblock Alice' })).toBeInTheDocument())
  })

  it('shows "Unblock" immediately when already blocked', async () => {
    mockIsBlocked.mockResolvedValue(true)
    render(<BlockReportControls targetUserId="other-1" targetName="Alice" orderId="order-1" />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Unblock Alice' })).toBeInTheDocument())
  })

  it('surfaces a block failure as a destructive toast without flipping the label', async () => {
    mockBlockUser.mockRejectedValue(new Error('You cannot block yourself'))
    render(<BlockReportControls targetUserId="other-1" targetName="Alice" orderId="order-1" />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Block Alice' })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Block Alice' }))
    await userEvent.click(screen.getByRole('button', { name: 'Block' }))

    // Dialog deliberately stays open on failure (so the user can retry)
    // rather than flipping to "Unblock" - the write never actually
    // succeeded.
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't block", variant: 'destructive' })))
    expect(screen.queryByRole('button', { name: 'Unblock Alice' })).not.toBeInTheDocument()
  })

  it('report submit stays disabled until a reason is picked', async () => {
    render(<BlockReportControls targetUserId="other-1" targetName="Alice" orderId="order-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Report Alice' }))

    expect(screen.getByRole('button', { name: 'Submit report' })).toBeDisabled()
    await userEvent.click(screen.getByRole('radio', { name: /harassment/i }))
    expect(screen.getByRole('button', { name: 'Submit report' })).toBeEnabled()
  })

  it('submits a report with the selected reason, description, and order id', async () => {
    mockFileReport.mockResolvedValue('report-1')
    render(<BlockReportControls targetUserId="other-1" targetName="Alice" orderId="order-1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Report Alice' }))
    await userEvent.click(screen.getByRole('radio', { name: /didn.t show up/i }))
    await userEvent.type(screen.getByLabelText(/details/i), 'never showed up')
    await userEvent.click(screen.getByRole('button', { name: 'Submit report' }))

    expect(mockFileReport).toHaveBeenCalledWith('other-1', 'no_show', 'never showed up', 'order-1')
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Report submitted' })))
  })
})
