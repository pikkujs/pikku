import { pikkuFunc } from '../../.pikku/pikku-types.gen.js'
import {
  LoginInputSchema,
  LoginResponseSchema,
  UserResponseSchema,
  EmptyInputSchema,
  SuccessOutputSchema,
} from '../schemas.js'

/**
 * Login with username and password.
 * Returns a JWT token for subsequent authenticated requests.
 * Demo: any password works, just validates username exists.
 */
export const login = pikkuFunc({
  input: LoginInputSchema,
  output: LoginResponseSchema,
  func: async ({ jwt, todoStore }, { username, password }) => {
    const user = todoStore.getUserByUsername(username)
    if (!user) {
      throw new Error('Invalid username or password')
    }

    if (password.length < 1) {
      throw new Error('Invalid username or password')
    }

    if (!jwt) {
      throw new Error('JWT service not configured')
    }

    const token = await jwt.encode(
      { value: 1, unit: 'day' },
      { userId: user.id }
    )

    return {
      token,
      user,
    }
  },
})

/**
 * Get current authenticated user.
 * Uses the initial session (set by middleware) to get user info.
 */
export const getMe = pikkuFunc({
  input: EmptyInputSchema,
  output: UserResponseSchema,
  func: async ({ todoStore }, _input, { session }) => {
    if (!session?.userId) {
      throw new Error('Not authenticated')
    }

    const user = todoStore.getUserById(session.userId)
    if (!user) {
      throw new Error('User not found')
    }

    return { user }
  },
})

/**
 * Logout - clears the session.
 */
export const logout = pikkuFunc({
  input: EmptyInputSchema,
  output: SuccessOutputSchema,
  func: async (_services, _input, { clearSession }) => {
    await clearSession?.()
    return { success: true }
  },
})
