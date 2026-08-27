import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/database-types'
import { SignupSchema, LoginSchema, ProfileUpdateSchema, ChangePasswordSchema, validateOrThrow } from '@/lib/validation'

export interface AuthUser {
  user: User
  profile: Profile | null
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  signUp: (email: string, password: string, userData: { fullName: string; phone: string }) => Promise<unknown>
  signIn: (email: string, password: string) => Promise<unknown>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Supabase can legitimately emit more than one state-change event for
    // the same already-signed-in user right after a fresh load (an
    // INITIAL_SESSION followed by a near-expiry TOKEN_REFRESHED, for
    // instance) - without this guard each one re-fetches the profile.
    // Tracked outside React state since it must be readable synchronously
    // from inside the event callback below, not just after a re-render.
    let fetchedForUserId: string | null = null

    const fetchUserProfile = async (authUser: User) => {
      fetchedForUserId = authUser.id
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching profile:', error)
        }

        setUser({ user: authUser, profile })
      } catch (error) {
        console.error('Error fetching profile:', error)
      } finally {
        setLoading(false)
      }
    }

    // A single shared listener for the whole app - one component instance
    // used to mean one supabase.auth.getSession() + one onAuthStateChange
    // subscription PER useAuth() caller, so a page with three consumers
    // (ProtectedRoute, the nav's AccountMenu, the page itself) fired the
    // profile fetch three times over. This provider is the one place that
    // does it now; useAuth() below just reads the shared result.
    //
    // The callback itself must not be `async`/await anything that re-enters
    // the supabase client (fetchUserProfile -> supabase.from(...) -> that
    // call internally awaits auth.getSession()). Supabase's own
    // initialize() holds an internal lock for the full duration of emitting
    // this event on a fresh page load with an already-persisted session; a
    // synchronous re-entrant call inside the callback ends up awaiting that
    // same still-open initialize() promise, which never resolves because
    // it's waiting on this callback to return - a permanent hang with zero
    // network activity. Deferring the re-entrant work to a macrotask lets
    // initialize() finish and release the lock first; this is Supabase's
    // own documented workaround for the deadlock (see GoTrueClient's
    // initialize()/_recoverAndRefresh()).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        if (session?.user) {
          if (fetchedForUserId === session.user.id) return
          void fetchUserProfile(session.user)
        } else {
          fetchedForUserId = null
          setUser(null)
          setLoading(false)
        }
      }, 0)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email: string, password: string, userData: { fullName: string; phone: string }) => {
    const validated = validateOrThrow(SignupSchema, {
      email,
      password,
      fullName: userData.fullName,
      phone: userData.phone,
    })

    const { data, error } = await supabase.auth.signUp({
      email: validated.email,
      password: validated.password,
      options: {
        data: {
          full_name: validated.fullName,
          phone: validated.phone,
        },
      },
    })

    if (error) throw error

    // Create profile. is_deliverer/total_deliveries/friend_count/avatar_url
    // don't exist on the live profiles table - anyone can be a deliverer
    // for someone else's order regardless of any flag (matches the orders
    // RLS policies, which never check such a flag either). rating/
    // successful_deliveries/balance all have DB defaults (0/0.0/0.0), so
    // they're left for Postgres to set rather than duplicated here.
    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert([{
        id: data.user.id,
        name: validated.fullName,
        email: validated.email,
        phone: validated.phone,
      }] as any)

      if (profileError) {
        console.error('Error creating profile:', profileError)
      }
    }

    return data
  }

  const signIn = async (email: string, password: string) => {
    const validated = validateOrThrow(LoginSchema, { email, password })

    const { data, error } = await supabase.auth.signInWithPassword({
      email: validated.email,
      password: validated.password,
    })

    if (error) throw error
    return data
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user?.user) throw new Error('No user logged in')

    const validated = validateOrThrow(ProfileUpdateSchema, updates)

    const { error } = await (supabase as any)
      .from('profiles')
      .update(validated)
      .eq('id', user.user.id)

    if (error) throw error

    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.user.id)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error refreshing profile:', fetchError)
    }

    setUser({ user: user.user, profile })
  }

  // Requires re-proving the current password (via a real sign-in call,
  // not a client-side comparison against anything cached) before issuing
  // the update - Supabase's updateUser() would otherwise accept a new
  // password from anyone holding an already-open session, with no check
  // that they actually know the old one.
  const changePassword = async (currentPassword: string, newPassword: string, confirmPassword: string) => {
    if (!user?.user.email) throw new Error('No user logged in')

    const validated = validateOrThrow(ChangePasswordSchema, { currentPassword, newPassword, confirmPassword })

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.user.email,
      password: validated.currentPassword,
    })
    if (reauthError) throw new Error('Current password is incorrect.')

    const { error } = await supabase.auth.updateUser({ password: validated.newPassword })
    if (error) throw error
  }

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut, updateProfile, changePassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
