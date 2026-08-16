import { pikkuFunc } from '#pikku/function'
import { callAdminApi } from '@pikku/better-auth'
import { Success, UserRef } from '../lib/user.schemas.js'

export const revokeUserSessions = pikkuFunc({
  title: 'Revoke User Sessions',
  description:
    'Signs a user out of every device by deleting all of their sessions. They keep their account and can sign in again.',
  expose: true,
  scopes: ['admin:users:sessions'],
  input: UserRef,
  output: Success,
  func: async ({ auth }, { userId }, { http }) => {
    await callAdminApi(auth, http, (api, headers) =>
      api.revokeUserSessions!({ body: { userId }, headers })
    )
    return { success: true }
  },
})
