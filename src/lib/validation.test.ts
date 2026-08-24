import { describe, it, expect } from 'vitest'
import {
  LoginSchema,
  SignupSchema,
  PostOrderSchema,
  ProfileUpdateSchema,
  ChatMessageSchema,
  OtpCodeSchema,
  validateOrThrow,
} from './validation'

describe('LoginSchema', () => {
  it('accepts a valid email/password', () => {
    expect(LoginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true)
  })

  it('rejects an invalid email', () => {
    const result = LoginSchema.safeParse({ email: 'not-an-email', password: 'x' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty password', () => {
    const result = LoginSchema.safeParse({ email: 'a@b.com', password: '' })
    expect(result.success).toBe(false)
  })
})

describe('SignupSchema', () => {
  const valid = { fullName: 'Jane Doe', email: 'jane@vitstudent.ac.in', phone: '9876543210', password: 'password123' }

  it('accepts valid signup data', () => {
    expect(SignupSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a short password', () => {
    expect(SignupSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false)
  })

  it('rejects a phone number that is not 10 digits', () => {
    expect(SignupSchema.safeParse({ ...valid, phone: '123' }).success).toBe(false)
    expect(SignupSchema.safeParse({ ...valid, phone: '12345678901' }).success).toBe(false)
  })

  it('rejects a one-character full name', () => {
    expect(SignupSchema.safeParse({ ...valid, fullName: 'J' }).success).toBe(false)
  })
})

describe('PostOrderSchema', () => {
  // Matches the live schema: orders.requester_id (not customer_id),
  // items/delivery_location as jsonb (not items_description/pickup_location
  // as strings), distance_km (not distance). No price/restaurant_icon/
  // completed_at - those columns don't exist live.
  const valid = {
    requester_id: '11111111-1111-1111-1111-111111111111',
    deliverer_id: null,
    restaurant_name: 'One Food',
    items: ['2x Chicken Burger', '1x Fries'],
    tip_amount: 30,
    delivery_location: { type: 'hostel' as const, label: "Men's Hostel K", hostelType: 'mens' as const, block: 'K' },
    distance_km: 1.2,
    status: 'pending' as const,
  }

  it('accepts a valid order', () => {
    expect(PostOrderSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects an empty items array', () => {
    expect(PostOrderSchema.safeParse({ ...valid, items: [] }).success).toBe(false)
  })

  it('rejects an items array with a blank line', () => {
    expect(PostOrderSchema.safeParse({ ...valid, items: [''] }).success).toBe(false)
  })

  it('rejects a tip below the ₹10 minimum', () => {
    expect(PostOrderSchema.safeParse({ ...valid, tip_amount: 5 }).success).toBe(false)
  })

  it('rejects a delivery_location missing a label', () => {
    expect(PostOrderSchema.safeParse({ ...valid, delivery_location: { type: 'campus', label: '' } }).success).toBe(false)
  })

  it('rejects a delivery_location that is a plain string (must be the jsonb shape)', () => {
    expect(PostOrderSchema.safeParse({ ...valid, delivery_location: "Men's Hostel K" }).success).toBe(false)
  })

  it('rejects a non-uuid requester_id', () => {
    expect(PostOrderSchema.safeParse({ ...valid, requester_id: 'not-a-uuid' }).success).toBe(false)
  })

  it('accepts a campus delivery location without hostel fields', () => {
    expect(PostOrderSchema.safeParse({ ...valid, delivery_location: { type: 'campus', label: 'TT Block' } }).success).toBe(true)
  })
})

describe('ProfileUpdateSchema', () => {
  it('accepts a partial update with just a name', () => {
    expect(ProfileUpdateSchema.safeParse({ name: 'New Name' }).success).toBe(true)
  })

  it('accepts an empty update', () => {
    expect(ProfileUpdateSchema.safeParse({}).success).toBe(true)
  })

  it('rejects a malformed phone number', () => {
    expect(ProfileUpdateSchema.safeParse({ phone: 'abc' }).success).toBe(false)
  })
})

describe('ChatMessageSchema', () => {
  it('accepts a normal message', () => {
    expect(ChatMessageSchema.safeParse({ message: 'On my way!' }).success).toBe(true)
  })

  it('rejects an empty/whitespace-only message', () => {
    expect(ChatMessageSchema.safeParse({ message: '   ' }).success).toBe(false)
  })

  it('rejects a message over 1000 characters', () => {
    expect(ChatMessageSchema.safeParse({ message: 'a'.repeat(1001) }).success).toBe(false)
  })
})

describe('OtpCodeSchema', () => {
  it('accepts a 6-digit code', () => {
    expect(OtpCodeSchema.safeParse('123456').success).toBe(true)
  })

  it('rejects a code with letters or the wrong length', () => {
    expect(OtpCodeSchema.safeParse('12a456').success).toBe(false)
    expect(OtpCodeSchema.safeParse('1234').success).toBe(false)
  })
})

describe('validateOrThrow', () => {
  it('returns the parsed value on success', () => {
    expect(validateOrThrow(LoginSchema, { email: 'a@b.com', password: 'x' })).toEqual({ email: 'a@b.com', password: 'x' })
  })

  it('throws an Error with the first issue message on failure', () => {
    expect(() => validateOrThrow(LoginSchema, { email: 'bad', password: 'x' })).toThrow()
  })
})
