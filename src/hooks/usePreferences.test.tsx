import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { createElement } from 'react'
import { createQueryBuilder, createSupabaseMock } from '@/test/supabaseMock'
import { DEFAULT_USER_PREFERENCES } from '@/lib/database-types'

const supabaseMock = createSupabaseMock()

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return supabaseMock
  },
}))

const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const { usePreferences, PreferencesProvider } = await import('./usePreferences')

const wrapper = ({ children }: { children: React.ReactNode }) => createElement(PreferencesProvider, null, children)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PreferencesProvider - no user signed in', () => {
  it('fetches nothing and holds no preferences', () => {
    mockUseAuth.mockReturnValue({ user: null })
    const { result } = renderHook(() => usePreferences(), { wrapper })

    expect(result.current.preferences).toBeNull()
    expect(result.current.preferredPointIds).toEqual(new Set())
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })
})

describe('PreferencesProvider - fetch on sign-in', () => {
  it('merges in every default for a legacy user with no saved row (not an error)', async () => {
    mockUseAuth.mockReturnValue({ user: { user: { id: 'user-1' } } })
    let call = 0
    supabaseMock.from.mockImplementation(() => {
      call += 1
      if (call === 1) return createQueryBuilder({ data: null, error: null }) // user_preferences: no row
      return createQueryBuilder({ data: [], error: null }) // user_preferred_points: none saved
    })

    const { result } = renderHook(() => usePreferences(), { wrapper })

    await waitFor(() => {
      expect(result.current.preferences).toEqual({
        user_id: 'user-1',
        created_at: '',
        ...DEFAULT_USER_PREFERENCES,
      })
    })
    expect(result.current.preferredPointIds).toEqual(new Set())
  })

  it('uses the real saved row and preferred points when they exist', async () => {
    mockUseAuth.mockReturnValue({ user: { user: { id: 'user-1' } } })
    const savedRow = {
      user_id: 'user-1',
      discovery_radius_km: 0.1,
      use_live_location: true,
      notify_chat_messages: false,
      notify_friend_events: true,
      discoverable: false,
      use_friends_in_recommendations: true,
      created_at: '2026-08-30T00:00:00Z',
    }
    let call = 0
    supabaseMock.from.mockImplementation(() => {
      call += 1
      if (call === 1) return createQueryBuilder({ data: savedRow, error: null })
      return createQueryBuilder({ data: [{ campus_point_id: 'point-a' }, { campus_point_id: 'point-b' }], error: null })
    })

    const { result } = renderHook(() => usePreferences(), { wrapper })

    await waitFor(() => expect(result.current.preferences).toEqual(savedRow))
    expect(result.current.preferredPointIds).toEqual(new Set(['point-a', 'point-b']))
  })

  it('fetches both tables in parallel via a single call, not one query per setting', async () => {
    mockUseAuth.mockReturnValue({ user: { user: { id: 'user-1' } } })
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: null, error: null }))

    renderHook(() => usePreferences(), { wrapper })

    await waitFor(() => expect(supabaseMock.from).toHaveBeenCalledTimes(2))
    expect(supabaseMock.from).toHaveBeenCalledWith('user_preferences')
    expect(supabaseMock.from).toHaveBeenCalledWith('user_preferred_points')
  })
})

describe('savePreferences', () => {
  it('upserts only the provided fields, scoped to the current user, and never includes a coordinate', async () => {
    mockUseAuth.mockReturnValue({ user: { user: { id: 'user-1' } } })
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: null, error: null }))
    const { result } = renderHook(() => usePreferences(), { wrapper })
    await waitFor(() => expect(result.current.preferences).not.toBeNull())

    const builder = createQueryBuilder({ data: { user_id: 'user-1', ...DEFAULT_USER_PREFERENCES, discoverable: false, created_at: '' }, error: null })
    supabaseMock.from.mockReturnValue(builder)

    await act(async () => {
      await result.current.savePreferences('user-1', { discoverable: false })
    })

    expect(builder.upsert).toHaveBeenCalledWith({ user_id: 'user-1', discoverable: false }, { onConflict: 'user_id' })
    const payload = vi.mocked(builder.upsert).mock.calls[0][0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('lat')
    expect(payload).not.toHaveProperty('lng')
    expect(result.current.preferences?.discoverable).toBe(false)
  })

  it('propagates a save error rather than silently succeeding', async () => {
    mockUseAuth.mockReturnValue({ user: { user: { id: 'user-1' } } })
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: null, error: null }))
    const { result } = renderHook(() => usePreferences(), { wrapper })
    await waitFor(() => expect(result.current.preferences).not.toBeNull())

    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: null, error: { message: 'permission denied' } }))

    await expect(
      act(async () => {
        await result.current.savePreferences('user-1', { discoverable: false })
      }),
    ).rejects.toThrow(/permission denied/i)
  })
})

describe('savePreferredPoints', () => {
  it('replaces the full set (delete then insert), scoped to the current user', async () => {
    mockUseAuth.mockReturnValue({ user: { user: { id: 'user-1' } } })
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: null, error: null }))
    const { result } = renderHook(() => usePreferences(), { wrapper })
    await waitFor(() => expect(result.current.preferences).not.toBeNull())

    const builder = createQueryBuilder({ data: null, error: null })
    supabaseMock.from.mockReturnValue(builder)

    await act(async () => {
      await result.current.savePreferredPoints('user-1', ['point-a', 'point-b'])
    })

    expect(builder.delete).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(builder.insert).toHaveBeenCalledWith([
      { user_id: 'user-1', campus_point_id: 'point-a' },
      { user_id: 'user-1', campus_point_id: 'point-b' },
    ])
    expect(result.current.preferredPointIds).toEqual(new Set(['point-a', 'point-b']))
  })

  it('skips the insert entirely when clearing every preferred area', async () => {
    mockUseAuth.mockReturnValue({ user: { user: { id: 'user-1' } } })
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: null, error: null }))
    const { result } = renderHook(() => usePreferences(), { wrapper })
    await waitFor(() => expect(result.current.preferences).not.toBeNull())

    const builder = createQueryBuilder({ data: null, error: null })
    supabaseMock.from.mockReturnValue(builder)

    await act(async () => {
      await result.current.savePreferredPoints('user-1', [])
    })

    expect(builder.delete).toHaveBeenCalled()
    expect(builder.insert).not.toHaveBeenCalled()
    expect(result.current.preferredPointIds).toEqual(new Set())
  })
})

describe('resetPreferences', () => {
  it('restores every scalar preference and clears every preferred area', async () => {
    mockUseAuth.mockReturnValue({ user: { user: { id: 'user-1' } } })
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: null, error: null }))
    const { result } = renderHook(() => usePreferences(), { wrapper })
    await waitFor(() => expect(result.current.preferences).not.toBeNull())

    const builder = createQueryBuilder({ data: { user_id: 'user-1', ...DEFAULT_USER_PREFERENCES, created_at: '' }, error: null })
    supabaseMock.from.mockReturnValue(builder)

    await act(async () => {
      await result.current.resetPreferences('user-1')
    })

    expect(builder.upsert).toHaveBeenCalledWith({ user_id: 'user-1', ...DEFAULT_USER_PREFERENCES }, { onConflict: 'user_id' })
    expect(builder.delete).toHaveBeenCalled()
    expect(result.current.preferredPointIds).toEqual(new Set())
  })
})
