import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createQueryBuilder, createSupabaseMock } from '@/test/supabaseMock'

const supabaseMock = {
  ...createSupabaseMock(),
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
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

const { useAuth } = await import('./useAuth')

beforeEach(() => {
  vi.clearAllMocks()
  supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null } })
  supabaseMock.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

describe('signUp', () => {
  it('creates the profile using live column names (name, not full_name) and no nonexistent columns', async () => {
    supabaseMock.auth.signUp.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    const builder = createQueryBuilder({ data: null, error: null })
    supabaseMock.from.mockReturnValue(builder)

    const { result } = renderHook(() => useAuth())

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
    const { result } = renderHook(() => useAuth())

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
    const { result } = renderHook(() => useAuth())

    await expect(
      act(async () => {
        await result.current.signIn('bad-email', '')
      })
    ).rejects.toThrow()

    expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('calls Supabase auth with valid credentials', async () => {
    supabaseMock.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })

    const { result } = renderHook(() => useAuth())

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
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
    })
    const profileBuilder = createQueryBuilder({
      data: { id: 'user-1', name: 'Jane', email: 'jane@vitstudent.ac.in', phone: '9876543210' },
      error: null,
    })
    supabaseMock.from.mockReturnValue(profileBuilder)

    const { result } = renderHook(() => useAuth())
    await act(async () => {
      await Promise.resolve()
    })

    await expect(
      act(async () => {
        await result.current.updateProfile({ phone: 'not-a-phone-number' })
      })
    ).rejects.toThrow()
  })
})
