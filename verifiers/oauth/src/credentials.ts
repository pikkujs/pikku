import { wireOAuth2Credential } from '@pikku/core/oauth2'

/**
 * Mock OAuth2 credential for testing OAuth flows.
 * Uses oauth2-mock-server running on localhost:8080
 */
wireOAuth2Credential({
  name: 'mock',
  displayName: 'Mock OAuth Provider',
  description: 'Mock OAuth2 provider for testing',
  secretId: 'MOCK_OAUTH_APP',
  tokenSecretId: 'MOCK_OAUTH_TOKENS',
  authorizationUrl: 'http://localhost:8080/authorize',
  tokenUrl: 'http://localhost:8080/token',
  scopes: ['openid', 'profile', 'email'],
})

/**
 * GitHub OAuth2 credential for real-world testing.
 */
wireOAuth2Credential({
  name: 'github',
  displayName: 'GitHub OAuth',
  description: 'OAuth2 credentials for GitHub API access',
  secretId: 'GITHUB_OAUTH_APP',
  tokenSecretId: 'GITHUB_OAUTH_TOKENS',
  authorizationUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  scopes: ['read:user', 'user:email'],
})
