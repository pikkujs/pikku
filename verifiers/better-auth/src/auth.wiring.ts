import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { bearer } from 'better-auth/plugins'
import { pikkuBetterAuth } from '#pikku'

/**
 * Verifier better-auth configuration. Exercises the full pikku integration:
 * email/password credentials plus a representative set of social providers
 * (including a hyphenated id and one with an extra config variable), all read
 * from the seeded secrets via the typed secret/variables services — the types
 * flow from the generated `CredentialsMap`/`VariablesMap`, so no inline generic
 * is needed. The pikku CLI generates the catch-all `/api/auth/**` wiring, the
 * session middleware, and a wireSecret for each provider.
 *
 * Better Auth owns its own user/session/account/verification tables. The
 * verifier injects a dedicated in-memory Kysely (see `services.ts`) and runs
 * Better Auth's migrations against it once, on the first auth request.
 */
let migrated: Promise<void> | undefined

export const auth = pikkuBetterAuth(async ({ secrets, variables, kysely }) => {
  const instance = betterAuth({
    secret: await secrets.getSecret('BETTER_AUTH_SECRET'),
    baseURL: 'http://localhost',
    database: { db: kysely, type: 'sqlite' },
    emailAndPassword: { enabled: true },
    // Sign the {session,user} snapshot into a cookie so the stateless session
    // middleware (betterAuthStatelessSession) can verify it without the full
    // server. The round-trip test in start.ts exercises exactly this cookie.
    session: { cookieCache: { enabled: true } },
    socialProviders: {
      github: await secrets.getSecret('GITHUB_OAUTH'),
      google: await secrets.getSecret('GOOGLE_OAUTH'),
      discord: await secrets.getSecret('DISCORD_OAUTH'),
      microsoft: {
        ...(await secrets.getSecret('MICROSOFT_OAUTH')),
        tenantId: await variables.get('MICROSOFT_TENANT_ID'),
      },
      cognito: {
        ...(await secrets.getSecret('COGNITO_OAUTH')),
        // services.ts seeds every provider variable, so these are present.
        domain: (await variables.get('COGNITO_DOMAIN'))!,
        region: (await variables.get('COGNITO_REGION'))!,
        userPoolId: (await variables.get('COGNITO_USER_POOL_ID'))!,
      },
    },
    plugins: [bearer()],
  })

  migrated ??= getMigrations(instance.options).then(({ runMigrations }) =>
    runMigrations()
  )
  await migrated

  return instance
})
