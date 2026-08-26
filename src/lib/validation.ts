import { z } from 'zod'
import { OrderItemsSchema, DeliveryLocationSchema } from './orderContent'

// ---------- Auth ----------

const VIT_EMAIL = /@vitstudent\.ac\.in$/i

const VITStudentEmailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Enter a valid email address')
  .refine((value) => VIT_EMAIL.test(value), 'Must use a VIT student email ending in @vitstudent.ac.in')

export const LoginSchema = z.object({
  email: VITStudentEmailSchema,
  password: z.string().min(1, 'Password is required'),
})
export type LoginInput = z.infer<typeof LoginSchema>

export const SignupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be under 100 characters'),
  email: VITStudentEmailSchema,
  phone: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Enter a 10-digit phone number'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be under 72 characters'),
})
export type SignupInput = z.infer<typeof SignupSchema>

// ---------- Orders ----------

export const PostOrderSchema = z.object({
  requester_id: z.string().uuid(),
  deliverer_id: z.null(),
  restaurant_name: z.string().trim().min(1, 'Select a restaurant').max(100),
  items: OrderItemsSchema,
  tip_amount: z.number().min(10, 'Tip must be at least ₹10').max(1000, 'Tip must be under ₹1000'),
  delivery_location: DeliveryLocationSchema,
  distance_km: z.number().min(0).max(50).nullable(),
  pickup_point_id: z.string().uuid().nullable(),
  delivery_point_id: z.string().uuid().nullable(),
  // A custom (user-dropped) pin - see PHASE3_3A_LOCATION_SPEC.md §14-§16.
  // Mutual exclusivity with delivery_point_id is a product invariant
  // PostRequest.tsx maintains, not something this schema enforces.
  custom_delivery_lat: z.number().min(-90).max(90).nullable(),
  custom_delivery_lng: z.number().min(-180).max(180).nullable(),
  custom_delivery_note: z.string().trim().max(300, 'Note must be under 300 characters').nullable(),
  // See PHASE3_3B_NEARBY_DISCOVERY_SPEC.md §5 - set alongside distance_km,
  // never guessed after the fact.
  distance_source: z.enum(['routed', 'fallback', 'unresolved']).nullable(),
  status: z.literal('pending'),
})
export type PostOrderInput = z.infer<typeof PostOrderSchema>

// ---------- Profile ----------

export const ProfileUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be under 100 characters')
    .optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Enter a 10-digit phone number')
    .optional(),
}).partial()
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>

// ---------- Chat ----------

export const ChatMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(1000, 'Message must be under 1000 characters'),
})
export type ChatMessageInput = z.infer<typeof ChatMessageSchema>

// ---------- OTP ----------

export const OtpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code')

// ---------- Ratings (Phase 3D) ----------

export const RatingSchema = z.object({
  score: z.number().int().min(1, 'Pick a star rating').max(5, 'Pick a star rating'),
  comment: z
    .string()
    .trim()
    .max(300, 'Comment must be under 300 characters')
    .optional()
    .or(z.literal('')),
})
export type RatingInput = z.infer<typeof RatingSchema>

/**
 * Validates `data` against `schema`, returning either the parsed value or a
 * single human-readable error message (the first issue) to show in a toast.
 */
export const validateOrThrow = <T>(schema: z.ZodType<T>, data: unknown): T => {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'Invalid input')
  }
  return result.data
}
