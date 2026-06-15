import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { defineAuth } from '@pikku/better-auth'

type OAuthSecret = { clientId: string; clientSecret: string }

/**
 * Verifier better-auth configuration. Exercises the full pikku integration:
 * email/password credentials plus a representative set of social providers
 * (including a hyphenated id and one with an extra config variable), all read
 * from the seeded secrets. The pikku CLI generates the catch-all `/api/auth/**`
 * wiring, the session middleware, and a wireSecret for each provider.
 */
export const auth = defineAuth(async ({ secrets, variables }) => {
  // Fetch every secret/variable in one batch rather than awaiting each.
  const {
    BETTER_AUTH_SECRET,
    GITHUB_OAUTH,
    GOOGLE_OAUTH,
    DISCORD_OAUTH,
    MICROSOFT_ENTRA_ID_OAUTH,
    COGNITO_OAUTH,
  } = await secrets.getSecrets<{
    BETTER_AUTH_SECRET: string
    GITHUB_OAUTH: OAuthSecret
    GOOGLE_OAUTH: OAuthSecret
    DISCORD_OAUTH: OAuthSecret
    MICROSOFT_ENTRA_ID_OAUTH: OAuthSecret
    COGNITO_OAUTH: OAuthSecret
  }>([
    'BETTER_AUTH_SECRET',
    'GITHUB_OAUTH',
    'GOOGLE_OAUTH',
    'DISCORD_OAUTH',
    'MICROSOFT_ENTRA_ID_OAUTH',
    'COGNITO_OAUTH',
  ])

  const { MICROSOFT_ENTRA_ID_TENANT_ID, COGNITO_DOMAIN } =
    await variables.getVariables<{
      MICROSOFT_ENTRA_ID_TENANT_ID: string
      COGNITO_DOMAIN: string
    }>(['MICROSOFT_ENTRA_ID_TENANT_ID', 'COGNITO_DOMAIN'])

  return betterAuth({
    secret: BETTER_AUTH_SECRET,
    baseURL: 'http://localhost',
    // In-memory store keeps the verifier self-contained (no external DB).
    database: memoryAdapter({}),
    emailAndPassword: { enabled: true },
    socialProviders: {
      github: GITHUB_OAUTH,
      google: GOOGLE_OAUTH,
      discord: DISCORD_OAUTH,
      'microsoft-entra-id': {
        ...MICROSOFT_ENTRA_ID_OAUTH,
        tenantId: MICROSOFT_ENTRA_ID_TENANT_ID,
      },
      cognito: {
        ...COGNITO_OAUTH,
        domain: COGNITO_DOMAIN,
      },
    },
  })
})
