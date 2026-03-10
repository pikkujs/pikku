import type { CoreCredential } from './credential.types.js'

/**
 * No-op function for declaring credentials.
 * This exists purely for TypeScript type checking and will be tree-shaken.
 * The CLI extracts metadata via AST parsing.
 *
 * @example
 * ```typescript
 * // Per-user API key
 * wireCredential({
 *   name: 'stripe',
 *   displayName: 'Stripe API Key',
 *   type: 'wire',
 *   schema: z.object({ apiKey: z.string() }),
 * })
 *
 * // Per-user OAuth
 * wireCredential({
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
 * wireCredential({
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
export const wireCredential = <T>(_config: CoreCredential<T>): void => {}
