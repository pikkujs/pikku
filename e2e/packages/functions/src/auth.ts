import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { bearer } from 'better-auth/plugins'
import { pikkuBetterAuth } from '#pikku/pikku-types.gen.js'

/**
 * Better Auth configuration for the e2e suite. Exercises email+password
 * credentials plus the GitHub social provider and the bearer plugin, all read
 * from the seeded secrets via the typed secret service (the secret types flow
 * from the generated `CredentialsMap`, so no inline generic is needed). The
 * pikku CLI generates the catch-all `/api/auth/**` wiring, the session-bridge
 * middleware, a wireSecret per provider, and the `auth-meta.gen.json` that
 * powers the console SSO page (providers + plugins).
 *
 * Better Auth owns its own user/session/account/verification tables. The suite
 * injects a dedicated in-memory Kysely (see `services.ts`) and runs Better
 * Auth's migrations against it once, on the first auth request — so the schema
 * exists without an external DB. State persists for the lifetime of the server
 * process; scenarios use unique emails rather than resetting.
 */
let migrated: Promise<void> | undefined

export const auth = pikkuBetterAuth(async ({ secrets, variables, kysely }) => {
  const instance = betterAuth({
    secret: await secrets.getSecret('BETTER_AUTH_SECRET'),
    baseURL: (await variables.get('API_URL')) ?? 'http://localhost:4077',
    database: { db: kysely, type: 'sqlite' },
    emailAndPassword: {
      enabled: true,
      // The e2e fixtures use short passwords (≥7 chars); keep the floor below
      // them so valid signups are not rejected on length.
      minPasswordLength: 6,
    },
    socialProviders: {
      github: await secrets.getSecret('GITHUB_OAUTH'),
    },
    plugins: [bearer()],
  })

  migrated ??= getMigrations(instance.options).then(({ runMigrations }) =>
    runMigrations()
  )
  await migrated

  return instance
})
