import { pikkuFunc } from '#pikku/function'
import { callAdminApi } from '@pikku/better-auth'
import { SetUserPasswordInput, Success } from '../lib/user.schemas.js'

export const setUserPassword = pikkuFunc({
  title: "Set User's Password",
  description:
    'Sets a user password out of band, for when they cannot complete a reset themselves. better-auth enforces the configured length bounds.',
  expose: true,
  scopes: ['admin:users:password'],
  input: SetUserPasswordInput,
  output: Success,
  func: async ({ auth }, { userId, newPassword }, { http }) => {
    await callAdminApi(auth, http, (api, headers) =>
      api.setUserPassword!({ body: { userId, newPassword }, headers })
    )
    return { success: true }
  },
})
