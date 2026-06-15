import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { defineAuth } from '@pikku/better-auth'

/**
 * Better Auth configuration.
 *
 * The pikku CLI inspects this `defineAuth` export and generates the catch-all
 * `/api/auth/**` HTTP wiring, the session-bridge middleware, and a `wireSecret`
 * for every configured social provider — so the auth routes and secret
 * requirements flow through normal inspection into the deploy manifest.
 *
 * The factory runs lazily on the first auth request, so it pulls secrets (and a
 * database) off the injected `services`.
 */
export const auth = defineAuth(async (services) =>
  betterAuth({
    secret: await services.secrets.getSecret('BETTER_AUTH_SECRET'),
    // In-memory store keeps the template zero-config; swap for the Kysely
    // adapter (`better-auth/adapters/kysely`) backed by `services.kysely` in
    // production.
    database: memoryAdapter({}),
    emailAndPassword: { enabled: true },
    socialProviders: {
      github: await services.secrets.getSecret<{
        clientId: string
        clientSecret: string
      }>('GITHUB_OAUTH'),
    },
  })
)
