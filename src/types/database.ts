export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          email: string | null
          phone: string | null
          created_at: string
          avatar_url: string | null
          is_deliverer: boolean
          rating: number | null
          total_deliveries: number
          balance: number
          friend_count: number
        }
        Insert: {
          id: string
          full_name?: string | null
          email?: string | null
          phone?: string | null
          created_at?: string
          avatar_url?: string | null
          is_deliverer?: boolean
          rating?: number | null
          total_deliveries?: number
          balance?: number
          friend_count?: number
        }
        Update: {
          id?: string
          full_name?: string | null
          email?: string | null
          phone?: string | null
          created_at?: string
          avatar_url?: string | null
          is_deliverer?: boolean
          rating?: number | null
          total_deliveries?: number
          balance?: number
          friend_count?: number
        }
      }
      orders: {
        Row: {
          id: string
          customer_id: string
          deliverer_id: string | null
          restaurant_name: string
          restaurant_icon: string
          items_description: string
          price: number
          tip_amount: number
          pickup_location: string
          delivery_location: string
          distance: number
          status: 'pending' | 'accepted' | 'picked_up' | 'out_for_delivery' | 'delivered' | 'cancelled'
          created_at: string
          updated_at: string
          completed_at: string | null
          otp_code: string | null
        }
        Insert: {
          id?: string
          customer_id: string
          deliverer_id?: string | null
          restaurant_name: string
          restaurant_icon: string
          items_description: string
          price: number
          tip_amount: number
          pickup_location: string
          delivery_location: string
          distance: number
          status?: 'pending' | 'accepted' | 'picked_up' | 'out_for_delivery' | 'delivered' | 'cancelled'
          created_at?: string
          updated_at?: string
          completed_at?: string | null
          otp_code?: string | null
        }
        Update: {
          id?: string
          customer_id?: string
          deliverer_id?: string | null
          restaurant_name?: string
          restaurant_icon?: string
          items_description?: string
          price?: number
          tip_amount?: number
          pickup_location?: string
          delivery_location?: string
          distance?: number
          status?: 'pending' | 'accepted' | 'picked_up' | 'out_for_delivery' | 'delivered' | 'cancelled'
          created_at?: string
          updated_at?: string
          completed_at?: string | null
          otp_code?: string | null
        }
      }
      chat_messages: {
        Row: {
          id: string
          order_id: string
          sender_id: string
          sender_type: 'customer' | 'deliverer'
          message: string
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          sender_id: string
          sender_type: 'customer' | 'deliverer'
          message: string
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          sender_id?: string
          sender_type?: 'customer' | 'deliverer'
          message?: string
          created_at?: string
        }
      }
      friendships: {
        Row: {
          id: string
          user_id: string
          friend_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          friend_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          friend_id?: string
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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