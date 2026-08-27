import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ActivityRedirect } from './ActivityRedirect'

const ShowSearch = () => {
  const location = useLocation()
  return <div>Ordering Page, search: {location.search}</div>
}

const renderAt = (initialPath: string) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/my-orders" element={<ActivityRedirect />} />
        <Route path="/activity" element={<ActivityRedirect />} />
        <Route path="/activity/ordering" element={<div>Ordering Page</div>} />
      </Routes>
    </MemoryRouter>,
  )

describe('ActivityRedirect', () => {
  it('redirects /my-orders to /activity/ordering', async () => {
    renderAt('/my-orders')
    expect(await screen.findByText('Ordering Page')).toBeInTheDocument()
  })

  it('redirects bare /activity to /activity/ordering', async () => {
    renderAt('/activity')
    expect(await screen.findByText('Ordering Page')).toBeInTheDocument()
  })

  it('preserves a notification deep-link query string (?order=<id>) through the redirect', async () => {
    render(
      <MemoryRouter initialEntries={['/my-orders?order=order-1']}>
        <Routes>
          <Route path="/my-orders" element={<ActivityRedirect />} />
          <Route path="/activity/ordering" element={<ShowSearch />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Ordering Page, search: ?order=order-1')).toBeInTheDocument()
  })
})
