import type { AuthProvider } from '@pikku/better-auth'

/**
 * A representative set of better-auth social providers the verifier configures —
 * including one with a single config variable (`microsoft` → tenantId) and one
 * with several (`cognito` → domain/region/userPoolId) to exercise the CLI's
 * wireSecret/wireVariable codegen.
 */
export const VERIFIER_OAUTH_PROVIDERS: AuthProvider[] = [
  'github',
  'google',
  'discord',
  'microsoft',
  'cognito',
]
