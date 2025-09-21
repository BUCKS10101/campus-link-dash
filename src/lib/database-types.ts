// Simplified types to avoid complex Supabase type inference issues
export interface Profile {
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

export interface Order {
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

export interface ChatMessage {
  id: string
  order_id: string
  sender_id: string
  sender_type: 'customer' | 'deliverer'
  message: string
  created_at: string
}

export interface Friendship {
  id: string
  user_id: string
  friend_id: string
  created_at: string
}

export interface OrderWithProfiles extends Order {
  customer_profile: Profile
  deliverer_profile: Profile | null
  is_friend?: boolean
}

export interface ChatMessageWithProfile extends ChatMessage {
  sender_profile: Profile
}