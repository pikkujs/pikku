import { pikkuFunc } from '#pikku/function'
import { callAdminApi } from '@pikku/better-auth'
import { SetUserBannedInput, Success } from '../lib/user.schemas.js'

export const setUserBanned = pikkuFunc({
  title: 'Ban or Unban User',
  description:
    'Bans a user — revoking their sessions and blocking sign-in — or lifts an existing ban. An expiry lets the ban lapse on its own; without one it holds until it is lifted.',
  expose: true,
  scopes: ['admin:users:ban'],
  input: SetUserBannedInput,
  output: Success,
  func: async (
    { auth },
    { userId, banned, reason, expiresInSeconds },
    { http }
  ) => {
    await callAdminApi(auth, http, (api, headers) =>
      banned
        ? api.banUser!({
            body: { userId, banReason: reason, banExpiresIn: expiresInSeconds },
            headers,
          })
        : api.unbanUser!({ body: { userId }, headers })
    )
    return { success: true }
  },
})
