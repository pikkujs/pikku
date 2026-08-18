import { pikkuFunc } from '#pikku/addon/function'
import { revokeAuthUserSessions } from '@pikku/better-auth'
import { Success, UserRef } from '../lib/user.schemas.js'

export const revokeUserSessions = pikkuFunc({
  title: 'Revoke User Sessions',
  description:
    'Signs a user out of every device by deleting all of their sessions. They keep their account and can sign in again.',
  expose: true,
  scopes: ['admin:users:sessions'],
  input: UserRef,
  output: Success,
  func: async ({ auth }, { userId }) => {
    await revokeAuthUserSessions(auth, userId)
    return { success: true }
  },
})
