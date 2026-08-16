import { pikkuFunc } from '#pikku/function'
import { setAuthUserPassword } from '@pikku/better-auth'
import { SetUserPasswordInput, Success } from '../lib/user.schemas.js'

export const setUserPassword = pikkuFunc({
  title: "Set User's Password",
  description:
    'Sets a user password out of band, for when they cannot complete a reset themselves. Enforces the configured length bounds, and gives a user who only ever signed in socially a credential account.',
  expose: true,
  scopes: ['admin:users:password'],
  input: SetUserPasswordInput,
  output: Success,
  func: async ({ auth }, { userId, newPassword }) => {
    await setAuthUserPassword(auth, { userId, newPassword })
    return { success: true }
  },
})
