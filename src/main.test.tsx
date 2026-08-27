import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const mockRender = vi.fn()
vi.mock('react-dom/client', () => ({
  createRoot: () => ({ render: mockRender }),
}))

// The real App.tsx pulls in the whole provider/router tree - irrelevant to
// what main.tsx itself is responsible for (picking which element to mount).
vi.mock('./App.tsx', () => ({
  default: () => <div data-testid="app-mounted">real app</div>,
}))

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  mockRender.mockClear()
  vi.resetModules()
})

afterEach(() => {
  vi.doUnmock('@/lib/supabase')
})

describe('main entry point', () => {
  it('boots the real app unchanged when Supabase configuration is valid', async () => {
    vi.doMock('@/lib/supabase', () => ({ supabaseConfigError: null }))

    await import('./main.tsx')

    expect(mockRender).toHaveBeenCalledTimes(1)
    const html = renderToStaticMarkup(mockRender.mock.calls[0][0])
    expect(html).toContain('app-mounted')
  })

  it('renders a configuration screen naming the missing variable instead of the app', async () => {
    vi.doMock('@/lib/supabase', () => ({
      supabaseConfigError: 'Missing VITE_SUPABASE_URL. Copy .env.example to .env and fill in your Supabase project values.',
    }))

    await import('./main.tsx')

    expect(mockRender).toHaveBeenCalledTimes(1)
    const html = renderToStaticMarkup(mockRender.mock.calls[0][0])
    expect(html).not.toContain('app-mounted')
    expect(html).toContain('VITE_SUPABASE_URL')
    expect(html).toContain('configured yet')
  })
})
