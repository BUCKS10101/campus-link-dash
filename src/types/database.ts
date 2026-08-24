// Verified against the live database schema (information_schema.columns +
// pg_constraint) during the Phase 1B schema-mismatch review - see
// supabase/migrations/ for the RLS/constraint/FK/OTP migrations this type
// must stay in sync with. This file mirrors the literal DB shape,
// including real nullability; src/lib/database-types.ts is a pragmatic,
// app-level simplification on top of it (same relationship the original
// codebase already had between these two files).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          name: string
          email: string
          phone: string | null
          hostel_block: string | null
          hostel_type: 'mens' | 'ladies' | 'campus' | null
          rating: number | null
          successful_deliveries: number | null
          balance: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          email: string
          phone?: string | null
          hostel_block?: string | null
          hostel_type?: 'mens' | 'ladies' | 'campus' | null
          rating?: number | null
          successful_deliveries?: number | null
          balance?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          email?: string
          phone?: string | null
          hostel_block?: string | null
          hostel_type?: 'mens' | 'ladies' | 'campus' | null
          rating?: number | null
          successful_deliveries?: number | null
          balance?: number | null
          created_at?: string | null
        }
      }
      orders: {
        Row: {
          id: string
          requester_id: string | null
          deliverer_id: string | null
          restaurant_name: string
          items: Json
          tip_amount: number | null
          delivery_location: Json
          status: 'pending' | 'accepted' | 'picked_up' | 'out_for_delivery' | 'delivered' | 'cancelled' | null
          /**
           * Column-level SELECT is revoked for anon/authenticated (see
           * supabase/migrations/20260824120300_otp_verification.sql). Never
           * select this directly - use the get_my_order_otp()/
           * verify_delivery_otp() RPCs. Present here only so Insert
           * payloads (which still need to write it) type-check.
           */
          otp: string | null
          distance_km: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          requester_id?: string | null
          deliverer_id?: string | null
          restaurant_name: string
          items: Json
          tip_amount?: number | null
          delivery_location: Json
          status?: 'pending' | 'accepted' | 'picked_up' | 'out_for_delivery' | 'delivered' | 'cancelled' | null
          otp?: string | null
          distance_km?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          requester_id?: string | null
          deliverer_id?: string | null
          restaurant_name?: string
          items?: Json
          tip_amount?: number | null
          delivery_location?: Json
          status?: 'pending' | 'accepted' | 'picked_up' | 'out_for_delivery' | 'delivered' | 'cancelled' | null
          otp?: string | null
          distance_km?: number | null
          created_at?: string | null
        }
      }
      chat_messages: {
        Row: {
          id: string
          order_id: string | null
          sender_id: string | null
          message: string
          created_at: string | null
        }
        Insert: {
          id?: string
          order_id?: string | null
          sender_id?: string | null
          message: string
          created_at?: string | null
        }
        Update: {
          id?: string
          order_id?: string | null
          sender_id?: string | null
          message?: string
          created_at?: string | null
        }
      }
      friendships: {
        Row: {
          id: string
          requester_id: string | null
          addressee_id: string | null
          status: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          requester_id?: string | null
          addressee_id?: string | null
          status?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          requester_id?: string | null
          addressee_id?: string | null
          status?: string | null
          created_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_order_otp: {
        Args: { p_order_id: string }
        Returns: string
      }
      verify_delivery_otp: {
        Args: { p_order_id: string; p_code: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Inserts<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type Updates<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
