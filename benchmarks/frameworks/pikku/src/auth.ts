import { betterAuth } from 'better-auth'
import { pikkuBetterAuth } from '#pikku/auth'
import { authOptions } from '../../shared/auth-options.js'

export const auth = pikkuBetterAuth(async ({ kysely, secrets }) =>
  betterAuth({
    ...authOptions((await secrets.getSecret('BETTER_AUTH_SECRET')).reveal()),
    database: { db: kysely, type: 'sqlite' },
  })
)
