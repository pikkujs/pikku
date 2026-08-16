import { pikkuFunc } from '#pikku/function'
import { callAdminApi } from '@pikku/better-auth'
import { CreateUserInput, CreateUserOutput } from '../lib/user.schemas.js'

export const createUser = pikkuFunc({
  title: 'Create User',
  description:
    'Creates a user directly, for provisioning an account out of band rather than through your sign-up flow. better-auth enforces the configured password bounds and rejects a duplicate email.',
  expose: true,
  scopes: ['admin:users:create'],
  input: CreateUserInput,
  output: CreateUserOutput,
  func: async ({ auth }, { email, password, name }, { http }) => {
    const created: any = await callAdminApi(auth, http, (api, headers) =>
      api.createUser!({
        body: { email, password, name: name ?? email },
        headers,
      })
    )
    return { userId: created?.user?.id ?? created?.id }
  },
})
