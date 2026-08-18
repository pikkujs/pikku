import { pikkuFunc } from '#pikku/addon/function'
import { setAuthUserBanned } from '@pikku/better-auth'
import { SetUserBannedInput, Success } from '../lib/user.schemas.js'

export const setUserBanned = pikkuFunc({
  title: 'Ban or Unban User',
  description:
    'Bans a user — revoking their sessions and blocking sign-in — or lifts an existing ban. An expiry lets the ban lapse on its own; without one it holds until it is lifted. Requires better-auth wired with the `ban()` plugin.',
  expose: true,
  scopes: ['admin:users:ban'],
  input: SetUserBannedInput,
  output: Success,
  func: async (
    { auth },
    { userId, banned, reason, expiresInSeconds },
    { session }
  ) => {
    if (banned && userId === session?.userId) {
      throw new Error('You cannot ban yourself')
    }
    await setAuthUserBanned(auth, { userId, banned, reason, expiresInSeconds })
    return { success: true }
  },
})
