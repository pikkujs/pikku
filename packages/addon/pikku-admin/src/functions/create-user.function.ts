import { pikkuFunc } from '#pikku/addon/function'
import { createAuthUser } from '@pikku/better-auth'
import { CreateUserInput, CreateUserOutput } from '../lib/user.schemas.js'

export const createUser = pikkuFunc({
  title: 'Create User',
  description:
    'Creates a user directly, for provisioning an account out of band rather than through your sign-up flow. Enforces the configured password bounds and rejects a duplicate email.',
  expose: true,
  scopes: ['admin:users:create'],
  input: CreateUserInput,
  output: CreateUserOutput,
  func: async ({ auth }, { email, password, name }) => ({
    userId: await createAuthUser(auth, { email, password, name }),
  }),
})
