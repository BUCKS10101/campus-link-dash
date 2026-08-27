import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Throwing here used to take the whole module graph down before React ever
// got to mount - main.tsx imports this (transitively, via useAuth.tsx)
// before it calls createRoot(), so the throw happened during import
// evaluation itself. ErrorBoundary never got a chance to exist yet (it's a
// component inside the tree that would have been rendered), so a missing
// .env produced a blank white page with no UI at all. Surfacing the
// problem as data instead lets main.tsx decide what to render.
const missingVars = [
  !supabaseUrl && 'VITE_SUPABASE_URL',
  !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY',
].filter((v): v is string => Boolean(v))

export const supabaseConfigError =
  missingVars.length > 0
    ? `Missing ${missingVars.join(' and ')}. Copy .env.example to .env and fill in your Supabase project values.`
    : null

// Inert placeholders, used only when config is missing - createClient()
// doesn't validate or make any network call at construction time, so these
// never throw. This client is never actually called against in that case:
// main.tsx renders a setup screen instead of <App/> whenever
// supabaseConfigError is set, so nothing ever reaches these values.
export const supabase = createClient<Database>(
  supabaseUrl || 'https://missing-config.invalid',
  supabaseAnonKey || 'missing-anon-key',
)

