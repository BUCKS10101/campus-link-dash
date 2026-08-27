import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// import.meta.env is read at module-evaluation time (a top-level const in
// supabase.ts), so each scenario needs a fresh module instance - vi.stubEnv
// alone wouldn't be seen by an already-evaluated module.
const importSupabase = async () => {
  const mod = await import('./supabase')
  return mod
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('supabaseConfigError', () => {
  it('never throws at import time when both vars are missing - only reports it as data', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    await expect(importSupabase()).resolves.toBeDefined()
  })

  it('reports the missing variable when only the URL is absent', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

    const { supabaseConfigError } = await importSupabase()

    expect(supabaseConfigError).toContain('VITE_SUPABASE_URL')
    expect(supabaseConfigError).not.toContain('VITE_SUPABASE_ANON_KEY')
  })

  it('reports the missing variable when only the anon key is absent', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    const { supabaseConfigError } = await importSupabase()

    expect(supabaseConfigError).toContain('VITE_SUPABASE_ANON_KEY')
    expect(supabaseConfigError).not.toContain('VITE_SUPABASE_URL')
  })

  it('reports both variables when both are absent', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    const { supabaseConfigError } = await importSupabase()

    expect(supabaseConfigError).toContain('VITE_SUPABASE_URL')
    expect(supabaseConfigError).toContain('VITE_SUPABASE_ANON_KEY')
  })

  it('never exposes a real secret value in the error message, even when one var is present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'super-secret-real-key')

    const { supabaseConfigError } = await importSupabase()

    expect(supabaseConfigError).not.toContain('super-secret-real-key')
  })

  it('is null when both variables are present - a valid configuration', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

    const { supabaseConfigError } = await importSupabase()

    expect(supabaseConfigError).toBeNull()
  })
})

describe('supabase client construction', () => {
  it('still constructs a real client with the real values when configuration is valid', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

    const { supabase, supabaseConfigError } = await importSupabase()

    expect(supabaseConfigError).toBeNull()
    expect(supabase).toBeDefined()
    expect(typeof supabase.from).toBe('function')
  })

  it('constructs an inert placeholder client rather than throwing when configuration is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    const { supabase, supabaseConfigError } = await importSupabase()

    expect(supabaseConfigError).not.toBeNull()
    expect(supabase).toBeDefined()
  })
})
