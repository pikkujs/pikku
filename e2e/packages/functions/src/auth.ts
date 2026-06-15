import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { pikkuBetterAuth } from '@pikku/better-auth'

type OAuthSecret = { clientId: string; clientSecret: string }

/**
 * Better Auth configuration for the e2e suite. Exercises email+password
 * credentials plus the GitHub social provider, all read from the seeded
 * secrets. The pikku CLI generates the catch-all `/api/auth/**` wiring, the
 * session-bridge middleware, and a wireSecret per provider.
 *
 * An in-memory adapter keeps the suite self-contained — Better Auth owns its
 * own user/session tables, so there is no app-level user store. State persists
 * for the lifetime of the server process; scenarios use unique emails rather
 * than resetting (Better Auth exposes no reset hook).
 */
export const auth = pikkuBetterAuth(async ({ secrets, variables }) => {
  const { BETTER_AUTH_SECRET, GITHUB_OAUTH } = await secrets.getSecrets<{
    BETTER_AUTH_SECRET: string
    GITHUB_OAUTH: OAuthSecret
  }>(['BETTER_AUTH_SECRET', 'GITHUB_OAUTH'])

  const { API_URL } = await variables.getVariables<{ API_URL: string }>([
    'API_URL',
  ])

  if (!BETTER_AUTH_SECRET) {
    throw new Error('Missing required secret: BETTER_AUTH_SECRET')
  }

  return betterAuth({
    secret: BETTER_AUTH_SECRET,
    baseURL: API_URL ?? 'http://localhost:4077',
    // The memory adapter needs an array per Better Auth model.
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
    emailAndPassword: {
      enabled: true,
      // The e2e fixtures use short passwords (≥7 chars); keep the floor below
      // them so valid signups are not rejected on length.
      minPasswordLength: 6,
    },
    socialProviders: {
      ...(GITHUB_OAUTH ? { github: GITHUB_OAUTH } : {}),
    },
  })
})
