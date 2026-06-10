import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'
import { findUserByEmail, resetUserStore } from './auth-user-store.js'

export const UserExistsInput = z.object({ email: z.string() })
export const UserExistsOutput = z.object({ exists: z.boolean() })

export const userExists = pikkuSessionlessFunc({
  description: 'Checks whether a user account exists',
  expose: true,
  input: UserExistsInput,
  output: UserExistsOutput,
  func: async (_services, { email }) => {
    return { exists: Boolean(findUserByEmail(email)) }
  },
})

export const ResetAuthUsersInput = z.object({})
export const ResetAuthUsersOutput = z.object({ success: z.boolean() })

export const resetAuthUsers = pikkuSessionlessFunc({
  description: 'Resets the in-memory user store (test isolation)',
  expose: true,
  input: ResetAuthUsersInput,
  output: ResetAuthUsersOutput,
  func: async () => {
    resetUserStore()
    return { success: true }
  },
})
