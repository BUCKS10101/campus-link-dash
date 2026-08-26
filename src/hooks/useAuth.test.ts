import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { createQueryBuilder, createSupabaseMock } from '@/test/supabaseMock'

type AuthChangeCallback = (event: string, session: unknown) => void

const supabaseMock = {
  ...createSupabaseMock(),
  auth: {
    onAuthStateChange: vi.fn<[AuthChangeCallback], { data: { subscription: { unsubscribe: () => void } } }>(),
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  },
}

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return supabaseMock
  },
}))

const { useAuth, AuthProvider } = await import('./useAuth')

const wrapper = ({ children }: { children: React.ReactNode }) => createElement(AuthProvider, null, children)

/** Fires the most recently registered callback, the way the real SDK would for a single subscriber. */
const emitAuthChange = (event: string, session: unknown) => {
  const callback = supabaseMock.auth.onAuthStateChange.mock.calls.at(-1)?.[0]
  callback?.(event, session)
}

/** Fires every registered callback - for tests with more than one mounted AuthProvider. */
const emitAuthChangeToAll = (event: string, session: unknown) => {
  for (const [callback] of supabaseMock.auth.onAuthStateChange.mock.calls) {
    callback?.(event, session)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  supabaseMock.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

describe('AuthProvider session hydration', () => {
  // Regression coverage for a real deadlock: supabase-js's initialize() on a
  // fresh page load with an already-persisted session holds an internal
  // lock for the full duration of emitting the auth-change event. If our
  // callback is `async` and awaits a call that re-enters the client
  // (fetchUserProfile -> supabase.from(...) -> internally awaits
  // getSession()), that await ends up waiting on the same still-open
  // initialize() promise the lock is gated behind - a permanent hang with
  // zero network activity, reproduced against the live staging project.
  // See useAuth.tsx's onAuthStateChange handler.
  it('the onAuthStateChange callback returns synchronously, never blocking on the profile fetch', async () => {
    renderHook(() => useAuth(), { wrapper })

    const callback = supabaseMock.auth.onAuthStateChange.mock.calls.at(-1)?.[0]
    const profileBuilder = createQueryBuilder({ data: { id: 'user-1', name: 'Jane' }, error: null })
    supabaseMock.from.mockReturnValue(profileBuilder)

    // A callback that itself awaits a re-entrant client call would return a
    // pending promise here; ours must not - it schedules work and returns.
    let returnValue: unknown
    await act(async () => {
      returnValue = callback?.('SIGNED_IN', { user: { id: 'user-1' } })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(returnValue).toBeUndefined()
  })

  it('resolves loading to false and hydrates the user once the session event carries one', async () => {
    const profileBuilder = createQueryBuilder({
      data: { id: 'user-1', name: 'Jane', email: 'jane@vitstudent.ac.in' },
      error: null,
    })
    supabaseMock.from.mockReturnValue(profileBuilder)

    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.loading).toBe(true)

    act(() => emitAuthChange('INITIAL_SESSION', { user: { id: 'user-1' } }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user?.user.id).toBe('user-1')
  })

  it('resolves loading to false with no user when the session event carries none', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    act(() => emitAuthChange('INITIAL_SESSION', null))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })

  it('resolves loading to false even if the profile fetch itself fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: null, error: { message: 'network error' } }))

    const { result } = renderHook(() => useAuth(), { wrapper })
    act(() => emitAuthChange('SIGNED_IN', { user: { id: 'user-1' } }))

    await waitFor(() => expect(result.current.loading).toBe(false))

    consoleError.mockRestore()
  })

  it('shares one auth state across every consumer, so the profile is only fetched once', async () => {
    const profileBuilder = createQueryBuilder({
      data: { id: 'user-1', name: 'Jane', email: 'jane@vitstudent.ac.in' },
      error: null,
    })
    supabaseMock.from.mockReturnValue(profileBuilder)

    const first = renderHook(() => useAuth(), { wrapper })
    const second = renderHook(() => useAuth(), { wrapper })

    act(() => emitAuthChangeToAll('INITIAL_SESSION', { user: { id: 'user-1' } }))

    await waitFor(() => expect(first.result.current.loading).toBe(false))
    await waitFor(() => expect(second.result.current.loading).toBe(false))

    // Two renderHook() calls each mount their own AuthProvider (the
    // wrapper), so this doesn't prove a single shared listener by itself -
    // but each provider only subscribes once regardless of how many
    // components consume its context, which is what actually eliminates
    // the old N-consumers-per-page duplication.
    expect(supabaseMock.auth.onAuthStateChange).toHaveBeenCalledTimes(2)
    expect(supabaseMock.from).toHaveBeenCalledTimes(2)
  })
})

describe('useAuth outside a provider', () => {
  it('throws instead of silently falling back to per-component state', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within an AuthProvider')
    consoleError.mockRestore()
  })
})

describe('signUp', () => {
  it('creates the profile using live column names (name, not full_name) and no nonexistent columns', async () => {
    supabaseMock.auth.signUp.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    const builder = createQueryBuilder({ data: null, error: null })
    supabaseMock.from.mockReturnValue(builder)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.signUp('jane@vitstudent.ac.in', 'password123', { fullName: 'Jane Doe', phone: '9876543210' })
    })

    expect(builder.insert).toHaveBeenCalledTimes(1)
    const inserted = vi.mocked(builder.insert).mock.calls[0][0][0]

    expect(inserted).toEqual({
      id: 'user-1',
      name: 'Jane Doe',
      email: 'jane@vitstudent.ac.in',
      phone: '9876543210',
    })
    expect(inserted).not.toHaveProperty('full_name')
    expect(inserted).not.toHaveProperty('is_deliverer')
    expect(inserted).not.toHaveProperty('total_deliveries')
    expect(inserted).not.toHaveProperty('friend_count')
    expect(inserted).not.toHaveProperty('avatar_url')
  })

  it('rejects invalid signup data before ever calling Supabase auth', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await expect(
      act(async () => {
        await result.current.signUp('not-an-email', 'password123', { fullName: 'Jane Doe', phone: '9876543210' })
      })
    ).rejects.toThrow()

    expect(supabaseMock.auth.signUp).not.toHaveBeenCalled()
  })
})

describe('signIn', () => {
  it('rejects invalid credentials before ever calling Supabase auth', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await expect(
      act(async () => {
        await result.current.signIn('bad-email', '')
      })
    ).rejects.toThrow()

    expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('calls Supabase auth with valid credentials', async () => {
    supabaseMock.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.signIn('jane@vitstudent.ac.in', 'password123')
    })

    expect(supabaseMock.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'jane@vitstudent.ac.in',
      password: 'password123',
    })
  })
})

describe('updateProfile', () => {
  it('rejects an update with an unrecognized/malformed field before hitting the DB', async () => {
    const profileBuilder = createQueryBuilder({
      data: { id: 'user-1', name: 'Jane', email: 'jane@vitstudent.ac.in', phone: '9876543210' },
      error: null,
    })
    supabaseMock.from.mockReturnValue(profileBuilder)

    const { result } = renderHook(() => useAuth(), { wrapper })
    act(() => emitAuthChange('INITIAL_SESSION', { user: { id: 'user-1' } }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(async () => {
        await result.current.updateProfile({ phone: 'not-a-phone-number' })
      })
    ).rejects.toThrow()
  })
})
