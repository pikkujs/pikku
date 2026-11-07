import { betterAuth } from 'better-auth'
import { pikkuBetterAuth } from '#pikku/auth'

export const auth = pikkuBetterAuth(async ({ kysely }) =>
  betterAuth({
    secret: 'fixture-secret-that-is-never-used-to-sign-anything',
    baseURL: 'http://localhost',
    database: { db: kysely, type: 'sqlite' },
  })
)
