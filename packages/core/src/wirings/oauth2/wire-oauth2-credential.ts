import { CoreOAuth2Credential } from './oauth2.types.js'

/**
 * No-op function for declaring OAuth2 credentials.
 * This exists purely for TypeScript type checking and will be tree-shaken.
 * The CLI extracts metadata via AST parsing.
 *
 * @example
 * ```typescript
 * wireOAuth2Credential({
 *   name: 'slackOAuth',
 *   displayName: 'Slack OAuth',
 *   secretId: 'SLACK_OAUTH_APP',
 *   tokenSecretId: 'SLACK_OAUTH_TOKENS',
 *   authorizationUrl: 'https://slack.com/oauth/v2/authorize',
 *   tokenUrl: 'https://slack.com/api/oauth.v2.access',
 *   scopes: ['chat:write', 'channels:read'],
 * })
 * ```
 */
export const wireOAuth2Credential = (_config: CoreOAuth2Credential): void => {
  // No-op - metadata only, extracted by CLI via AST
}
