import { z } from 'zod'

// ---------- Auth ----------

export const LoginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
export type LoginInput = z.infer<typeof LoginSchema>

export const SignupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be under 100 characters'),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
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
  customer_id: z.string().uuid(),
  deliverer_id: z.null(),
  restaurant_name: z.string().trim().min(1, 'Select a restaurant').max(100),
  restaurant_icon: z.string().trim().min(1).max(10),
  items_description: z
    .string()
    .trim()
    .min(10, 'Describe your order in at least 10 characters')
    .max(500, 'Order description must be under 500 characters'),
  price: z.number().min(0).max(10000),
  tip_amount: z.number().min(10, 'Tip must be at least ₹10').max(1000, 'Tip must be under ₹1000'),
  pickup_location: z.string().trim().min(1).max(200),
  delivery_location: z.string().trim().min(1, 'Select a delivery location').max(200),
  distance: z.number().min(0).max(50),
  status: z.literal('pending'),
  completed_at: z.null(),
})
export type PostOrderInput = z.infer<typeof PostOrderSchema>

// ---------- Profile ----------

export const ProfileUpdateSchema = z.object({
  full_name: z
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
