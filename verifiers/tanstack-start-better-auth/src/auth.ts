import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { pikkuBetterAuth } from '#pikku/auth/auth.types.js'

let migrated: Promise<void> | undefined

export const auth = pikkuBetterAuth(async ({ secrets, kysely }) => {
  const instance = betterAuth({
    secret: await secrets.getSecret('BETTER_AUTH_SECRET'),
    baseURL: process.env.FRONTEND_URL ?? 'http://127.0.0.1:3120',
    database: { db: kysely, type: 'sqlite' },
    emailAndPassword: { enabled: true },
  })

  migrated ??= getMigrations(instance.options).then(({ runMigrations }) =>
    runMigrations()
  )
  await migrated

  return instance
})
