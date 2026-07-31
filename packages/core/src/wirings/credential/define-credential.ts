import type { CoreCredential } from './credential.types.js'

/**
 * Declares a credential. The body is a no-op that tree-shakes away — the CLI
 * reads the call by AST, so the declaration must be a top-level literal.
 * `type: 'wire'` is per-user, `type: 'singleton'` is platform-wide.
 *
 * @example
 * ```typescript
 * // Per-user API key
 * defineCredential({
 *   name: 'stripe',
 *   displayName: 'Stripe API Key',
 *   type: 'wire',
 *   schema: z.object({ apiKey: z.string() }),
 * })
 *
 * // Per-user OAuth
 * defineCredential({
 *   name: 'google-sheets',
 *   displayName: 'Google Sheets',
 *   type: 'wire',
 *   schema: z.object({ accessToken: z.string(), refreshToken: z.string() }),
 *   oauth2: {
 *     appCredentialSecretId: 'GOOGLE_OAUTH_APP',
 *     authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
 *     tokenUrl: 'https://oauth2.googleapis.com/token',
 *     scopes: ['https://www.googleapis.com/auth/spreadsheets'],
 *     tokenSecretId: 'GOOGLE_OAUTH_TOKENS',
 *   }
 * })
 *
 * // Platform-level OAuth (singleton)
 * defineCredential({
 *   name: 'slack',
 *   displayName: 'Slack',
 *   type: 'singleton',
 *   schema: z.object({ accessToken: z.string(), refreshToken: z.string() }),
 *   oauth2: {
 *     appCredentialSecretId: 'SLACK_OAUTH_APP',
 *     authorizationUrl: 'https://slack.com/oauth/v2/authorize',
 *     tokenUrl: 'https://slack.com/api/oauth.v2.access',
 *     scopes: ['chat:write', 'channels:read'],
 *     tokenSecretId: 'SLACK_OAUTH_TOKENS',
 *   }
 * })
 * ```
 */
export const defineCredential = <T>(_config: CoreCredential<T>): void => {}
