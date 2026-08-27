import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ActivityRoleSwitch } from './ActivityRoleSwitch'

const renderSwitch = (active: 'ordering' | 'delivering') =>
  render(
    <MemoryRouter>
      <ActivityRoleSwitch active={active} />
    </MemoryRouter>,
  )

describe('ActivityRoleSwitch', () => {
  it('renders exactly Ordering and Delivering as real links, not buttons', () => {
    renderSwitch('ordering')
    const ordering = screen.getByRole('link', { name: 'Ordering' })
    const delivering = screen.getByRole('link', { name: 'Delivering' })
    expect(ordering).toHaveAttribute('href', '/activity/ordering')
    expect(delivering).toHaveAttribute('href', '/activity/delivering')
  })

  it('marks Ordering current when active="ordering"', () => {
    renderSwitch('ordering')
    expect(screen.getByRole('link', { name: 'Ordering' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Delivering' })).not.toHaveAttribute('aria-current')
  })

  it('marks Delivering current when active="delivering"', () => {
    renderSwitch('delivering')
    expect(screen.getByRole('link', { name: 'Delivering' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Ordering' })).not.toHaveAttribute('aria-current')
  })

  it('is a labelled navigation landmark, reachable by keyboard like any link', () => {
    renderSwitch('ordering')
    expect(screen.getByRole('navigation', { name: /activity view/i })).toBeInTheDocument()
  })
})
