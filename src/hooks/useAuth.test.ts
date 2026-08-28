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
    updateUser: vi.fn(),
    resetPasswordForEmail: vi.fn(),
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

  describe('missing-profile self-heal (production incident, 2026-08-29)', () => {
    // Root cause: when Confirm Email is on, signUp()'s own profile insert
    // runs with no live session (signUp() doesn't return one until the
    // link is clicked), so profiles_insert_own's RLS check silently
    // rejects it - every real signup ended up with a session but no
    // profile row, breaking anything that reads or FK-references
    // profiles (posting, rate limiting, etc). fetchUserProfile now
    // retries the insert here, where a real session (and therefore a
    // correctly-resolving auth.uid()) is guaranteed to exist.
    it('creates the profile from signup metadata when none exists yet (PGRST116)', async () => {
      const selectBuilder = createQueryBuilder({ data: null, error: { code: 'PGRST116' } })
      const insertBuilder = createQueryBuilder({
        data: { id: 'user-1', name: 'Jane Doe', email: 'jane@vitstudent.ac.in', phone: '9876543210' },
        error: null,
      })
      supabaseMock.from
        .mockReturnValueOnce(selectBuilder)
        .mockReturnValueOnce(insertBuilder)

      const { result } = renderHook(() => useAuth(), { wrapper })
      act(() => emitAuthChange('SIGNED_IN', {
        user: { id: 'user-1', email: 'jane@vitstudent.ac.in', user_metadata: { full_name: 'Jane Doe', phone: '9876543210' } },
      }))

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(insertBuilder.insert).toHaveBeenCalledWith([{
        id: 'user-1', name: 'Jane Doe', email: 'jane@vitstudent.ac.in', phone: '9876543210',
      }])
      expect(result.current.user?.profile).toEqual({
        id: 'user-1', name: 'Jane Doe', email: 'jane@vitstudent.ac.in', phone: '9876543210',
      })
    })

    it('falls back to the email prefix as a name when signup metadata is missing entirely', async () => {
      const selectBuilder = createQueryBuilder({ data: null, error: { code: 'PGRST116' } })
      const insertBuilder = createQueryBuilder({ data: { id: 'user-1', name: 'oldaccount' }, error: null })
      supabaseMock.from
        .mockReturnValueOnce(selectBuilder)
        .mockReturnValueOnce(insertBuilder)

      const { result } = renderHook(() => useAuth(), { wrapper })
      act(() => emitAuthChange('SIGNED_IN', { user: { id: 'user-1', email: 'oldaccount@vitstudent.ac.in', user_metadata: {} } }))

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(insertBuilder.insert).toHaveBeenCalledWith([{
        id: 'user-1', name: 'oldaccount', email: 'oldaccount@vitstudent.ac.in', phone: null,
      }])
    })

    it('does not attempt to self-heal when the profile fetch fails for a different reason', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const selectBuilder = createQueryBuilder({ data: null, error: { code: 'OTHER_ERROR', message: 'network error' } })
      supabaseMock.from.mockReturnValueOnce(selectBuilder)

      const { result } = renderHook(() => useAuth(), { wrapper })
      act(() => emitAuthChange('SIGNED_IN', { user: { id: 'user-1', email: 'jane@vitstudent.ac.in' } }))

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(supabaseMock.from).toHaveBeenCalledTimes(1) // select only, no insert attempt
      expect(result.current.user?.profile).toBeNull()
      consoleError.mockRestore()
    })

    it('logs but does not crash if the self-heal insert itself fails', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const selectBuilder = createQueryBuilder({ data: null, error: { code: 'PGRST116' } })
      const insertBuilder = createQueryBuilder({ data: null, error: { message: 'still blocked' } })
      supabaseMock.from
        .mockReturnValueOnce(selectBuilder)
        .mockReturnValueOnce(insertBuilder)

      const { result } = renderHook(() => useAuth(), { wrapper })
      act(() => emitAuthChange('SIGNED_IN', { user: { id: 'user-1', email: 'jane@vitstudent.ac.in' } }))

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.user?.profile).toBeNull()
      expect(consoleError).toHaveBeenCalledWith('Error self-healing missing profile:', { message: 'still blocked' })
      consoleError.mockRestore()
    })
  })
})

// Phase 3J - see PHASE3_3J_TRUST_SAFETY_SPEC.md §2. emailVerified is a
// derived field, never a new DB column - purely session.user.email_confirmed_at != null.
describe('emailVerified (Phase 3J)', () => {
  it('is false when email_confirmed_at is null', async () => {
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: { id: 'user-1', name: 'Jane' }, error: null }))
    const { result } = renderHook(() => useAuth(), { wrapper })

    act(() => emitAuthChange('INITIAL_SESSION', { user: { id: 'user-1', email_confirmed_at: null } }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user?.emailVerified).toBe(false)
  })

  it('is true once email_confirmed_at carries a timestamp', async () => {
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: { id: 'user-1', name: 'Jane' }, error: null }))
    const { result } = renderHook(() => useAuth(), { wrapper })

    act(() => emitAuthChange('INITIAL_SESSION', { user: { id: 'user-1', email_confirmed_at: '2026-08-28T10:00:00.000Z' } }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user?.emailVerified).toBe(true)
  })

  // Regression: a later auth event for the SAME user id used to be
  // dropped entirely (the fetchedForUserId guard existed to avoid
  // re-fetching the profile row) - which meant a real confirmation-link
  // click's fresh session.user (new email_confirmed_at) was silently
  // discarded and emailVerified never flipped without a full reload.
  it('flips from false to true on a later same-user event, without re-fetching the profile', async () => {
    const profileBuilder = createQueryBuilder({ data: { id: 'user-1', name: 'Jane' }, error: null })
    supabaseMock.from.mockReturnValue(profileBuilder)
    const { result } = renderHook(() => useAuth(), { wrapper })

    act(() => emitAuthChange('INITIAL_SESSION', { user: { id: 'user-1', email_confirmed_at: null } }))
    await waitFor(() => expect(result.current.user?.emailVerified).toBe(false))
    const fromCallsAfterFirstFetch = supabaseMock.from.mock.calls.length

    act(() => emitAuthChange('SIGNED_IN', { user: { id: 'user-1', email_confirmed_at: '2026-08-28T10:05:00.000Z' } }))

    await waitFor(() => expect(result.current.user?.emailVerified).toBe(true))
    expect(supabaseMock.from.mock.calls.length).toBe(fromCallsAfterFirstFetch)
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

  it('detects Supabase\'s "already registered" signal (empty identities array) and throws a clear error instead of a false success', async () => {
    // Supabase's real anti-enumeration response shape for signUp() on an
    // already-confirmed email: error is null, but the returned user is a
    // fabricated object (never persisted) with an empty identities array -
    // confirmed empirically against production, QA audit AUTH-03.
    supabaseMock.auth.signUp.mockResolvedValue({
      data: { user: { id: 'fabricated-id', identities: [] }, session: null },
      error: null,
    })
    const builder = createQueryBuilder({ data: null, error: null })
    supabaseMock.from.mockReturnValue(builder)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await expect(
      act(async () => {
        await result.current.signUp('already-registered@vitstudent.ac.in', 'password123', { fullName: 'Jane Doe', phone: '9876543210' })
      })
    ).rejects.toThrow(/already exists/i)

    // Must not attempt to insert a profile row for the fabricated id - it
    // was never actually created in auth.users, so the insert would just
    // fail on the FK constraint (silently, console-only) if attempted.
    expect(builder.insert).not.toHaveBeenCalled()
  })

  it('still succeeds normally for a real new signup with a non-empty identities array', async () => {
    supabaseMock.auth.signUp.mockResolvedValue({
      data: { user: { id: 'user-1', identities: [{ provider: 'email' }] }, session: null },
      error: null,
    })
    const builder = createQueryBuilder({ data: null, error: null })
    supabaseMock.from.mockReturnValue(builder)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.signUp('genuinely-new@vitstudent.ac.in', 'password123', { fullName: 'Jane Doe', phone: '9876543210' })
    })

    expect(builder.insert).toHaveBeenCalledTimes(1)
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

describe('sendPasswordResetEmail', () => {
  it('rejects an invalid email before ever calling Supabase', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await expect(
      act(async () => {
        await result.current.sendPasswordResetEmail('not-an-email')
      })
    ).rejects.toThrow()

    expect(supabaseMock.auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('calls Supabase with a redirectTo pointing at /reset-password', async () => {
    supabaseMock.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.sendPasswordResetEmail('jane@vitstudent.ac.in')
    })

    expect(supabaseMock.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'jane@vitstudent.ac.in',
      expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') })
    )
  })

  it('propagates a Supabase error', async () => {
    supabaseMock.auth.resetPasswordForEmail.mockResolvedValue({ data: null, error: { message: 'Rate limited' } })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await expect(
      act(async () => {
        await result.current.sendPasswordResetEmail('jane@vitstudent.ac.in')
      })
    ).rejects.toBeTruthy()
  })
})

describe('updatePasswordAfterReset', () => {
  it('rejects a mismatched confirmation before calling Supabase', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await expect(
      act(async () => {
        await result.current.updatePasswordAfterReset('newPassword123', 'different456')
      })
    ).rejects.toThrow()

    expect(supabaseMock.auth.updateUser).not.toHaveBeenCalled()
  })

  it('does not require a current-password reproof, unlike changePassword', async () => {
    supabaseMock.auth.updateUser.mockResolvedValue({ data: {}, error: null })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.updatePasswordAfterReset('newPassword123', 'newPassword123')
    })

    expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled()
    expect(supabaseMock.auth.updateUser).toHaveBeenCalledWith({ password: 'newPassword123' })
  })
})

describe('changePassword', () => {
  const signInAs = async (result: { current: ReturnType<typeof useAuth> }) => {
    const profileBuilder = createQueryBuilder({
      data: { id: 'user-1', name: 'Jane', email: 'jane@vitstudent.ac.in' },
      error: null,
    })
    supabaseMock.from.mockReturnValue(profileBuilder)
    act(() => emitAuthChange('INITIAL_SESSION', { user: { id: 'user-1', email: 'jane@vitstudent.ac.in' } }))
    await waitFor(() => expect(result.current.loading).toBe(false))
  }

  it('rejects a mismatched confirmation before calling Supabase at all', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    await signInAs(result)

    await expect(
      act(async () => {
        await result.current.changePassword('oldpass123', 'newpass123', 'different123')
      })
    ).rejects.toThrow()

    expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled()
    expect(supabaseMock.auth.updateUser).not.toHaveBeenCalled()
  })

  it('re-authenticates with the current password before updating, and surfaces a clear error if it is wrong', async () => {
    supabaseMock.auth.signInWithPassword.mockResolvedValue({ data: null, error: { message: 'Invalid login credentials' } })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await signInAs(result)

    await expect(
      act(async () => {
        await result.current.changePassword('wrongpass', 'newpass123', 'newpass123')
      })
    ).rejects.toThrow('Current password is incorrect.')

    expect(supabaseMock.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'jane@vitstudent.ac.in',
      password: 'wrongpass',
    })
    expect(supabaseMock.auth.updateUser).not.toHaveBeenCalled()
  })

  it('updates the password once the current one is verified', async () => {
    supabaseMock.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    supabaseMock.auth.updateUser.mockResolvedValue({ data: {}, error: null })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await signInAs(result)

    await act(async () => {
      await result.current.changePassword('oldpass123', 'newpass123', 'newpass123')
    })

    expect(supabaseMock.auth.updateUser).toHaveBeenCalledWith({ password: 'newpass123' })
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
