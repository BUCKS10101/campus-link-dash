import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = 'https://kjsseqlmnmjuqepfmldh.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtqc3NlcWxtbm1pdXFlcGZtbGRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0NTYyMDEsImV4cCI6MjA3NDAzMjIwMX0.uZbc-o__zev3uQOVrXESfArDSbow1XfC9vdXWmO_e0Q'

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)