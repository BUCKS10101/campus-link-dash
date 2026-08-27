import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Throwing here (at module-import time) takes down the whole bundle before
// React mounts, so a missing .env produced a silent white screen with no
// error UI. Surface the problem as data instead and let main.tsx render an
// actionable setup screen.
export const supabaseConfigError =
  !supabaseUrl || !supabaseAnonKey
    ? 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project values.'
    : null

export const supabase = createClient<Database>(
  supabaseUrl || 'https://config-missing.invalid',
  supabaseAnonKey || 'config-missing'
)
