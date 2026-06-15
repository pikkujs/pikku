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
export const auth = defineAuth(async ({ secrets }) => {
  // Fetch every secret in one batch rather than awaiting each individually.
  const { BETTER_AUTH_SECRET, GITHUB_OAUTH } = await secrets.getSecrets<{
    BETTER_AUTH_SECRET: string
    GITHUB_OAUTH: { clientId: string; clientSecret: string }
  }>(['BETTER_AUTH_SECRET', 'GITHUB_OAUTH'])

  return betterAuth({
    secret: BETTER_AUTH_SECRET,
    // In-memory store keeps the template zero-config; swap for the Kysely
    // adapter (`better-auth/adapters/kysely`) backed by `services.kysely` in
    // production. The memory adapter needs an array per better-auth model.
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
    emailAndPassword: { enabled: true },
    socialProviders: {
      github: GITHUB_OAUTH,
    },
  })
})
