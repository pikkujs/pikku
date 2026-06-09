export interface AuthProviderDef {
  /** Import path (relative to @auth/core) */
  importPath: string
  /** Default export name used in generated code */
  importName: string
  /** Secret key stored in SecretService */
  secretId: string
  /** Display name for the secret */
  displayName: string
  /** Schema fields: field name → zod type string */
  fields: Record<string, string>
}

export const PROVIDER_REGISTRY: Record<string, AuthProviderDef> = {
  github: {
    importPath: '@auth/core/providers/github',
    importName: 'GitHub',
    secretId: 'GITHUB_OAUTH',
    displayName: 'GitHub OAuth',
    fields: {
      clientId: 'z.string().describe("GitHub OAuth client ID")',
      clientSecret: 'z.string().describe("GitHub OAuth client secret")',
    },
  },
  google: {
    importPath: '@auth/core/providers/google',
    importName: 'Google',
    secretId: 'GOOGLE_OAUTH',
    displayName: 'Google OAuth',
    fields: {
      clientId: 'z.string().describe("Google OAuth client ID")',
      clientSecret: 'z.string().describe("Google OAuth client secret")',
    },
  },
  discord: {
    importPath: '@auth/core/providers/discord',
    importName: 'Discord',
    secretId: 'DISCORD_OAUTH',
    displayName: 'Discord OAuth',
    fields: {
      clientId: 'z.string().describe("Discord OAuth client ID")',
      clientSecret: 'z.string().describe("Discord OAuth client secret")',
    },
  },
  twitter: {
    importPath: '@auth/core/providers/twitter',
    importName: 'Twitter',
    secretId: 'TWITTER_OAUTH',
    displayName: 'Twitter / X OAuth',
    fields: {
      clientId: 'z.string().describe("Twitter OAuth client ID")',
      clientSecret: 'z.string().describe("Twitter OAuth client secret")',
    },
  },
  apple: {
    importPath: '@auth/core/providers/apple',
    importName: 'Apple',
    secretId: 'APPLE_OAUTH',
    displayName: 'Apple OAuth',
    fields: {
      clientId: 'z.string().describe("Apple OAuth client ID")',
      clientSecret: 'z.string().describe("Apple OAuth client secret")',
    },
  },
  facebook: {
    importPath: '@auth/core/providers/facebook',
    importName: 'Facebook',
    secretId: 'FACEBOOK_OAUTH',
    displayName: 'Facebook OAuth',
    fields: {
      clientId: 'z.string().describe("Facebook OAuth client ID")',
      clientSecret: 'z.string().describe("Facebook OAuth client secret")',
    },
  },
  linkedin: {
    importPath: '@auth/core/providers/linkedin',
    importName: 'LinkedIn',
    secretId: 'LINKEDIN_OAUTH',
    displayName: 'LinkedIn OAuth',
    fields: {
      clientId: 'z.string().describe("LinkedIn OAuth client ID")',
      clientSecret: 'z.string().describe("LinkedIn OAuth client secret")',
    },
  },
  slack: {
    importPath: '@auth/core/providers/slack',
    importName: 'Slack',
    secretId: 'SLACK_OAUTH',
    displayName: 'Slack OAuth',
    fields: {
      clientId: 'z.string().describe("Slack OAuth client ID")',
      clientSecret: 'z.string().describe("Slack OAuth client secret")',
    },
  },
  spotify: {
    importPath: '@auth/core/providers/spotify',
    importName: 'Spotify',
    secretId: 'SPOTIFY_OAUTH',
    displayName: 'Spotify OAuth',
    fields: {
      clientId: 'z.string().describe("Spotify OAuth client ID")',
      clientSecret: 'z.string().describe("Spotify OAuth client secret")',
    },
  },
  twitch: {
    importPath: '@auth/core/providers/twitch',
    importName: 'Twitch',
    secretId: 'TWITCH_OAUTH',
    displayName: 'Twitch OAuth',
    fields: {
      clientId: 'z.string().describe("Twitch OAuth client ID")',
      clientSecret: 'z.string().describe("Twitch OAuth client secret")',
    },
  },
  gitlab: {
    importPath: '@auth/core/providers/gitlab',
    importName: 'GitLab',
    secretId: 'GITLAB_OAUTH',
    displayName: 'GitLab OAuth',
    fields: {
      clientId: 'z.string().describe("GitLab OAuth client ID")',
      clientSecret: 'z.string().describe("GitLab OAuth client secret")',
    },
  },
  auth0: {
    importPath: '@auth/core/providers/auth0',
    importName: 'Auth0',
    secretId: 'AUTH0_OAUTH',
    displayName: 'Auth0',
    fields: {
      clientId: 'z.string().describe("Auth0 client ID")',
      clientSecret: 'z.string().describe("Auth0 client secret")',
      issuer: 'z.string().describe("Auth0 issuer URL")',
    },
  },
  'azure-ad': {
    importPath: '@auth/core/providers/microsoft-entra-id',
    importName: 'MicrosoftEntraId',
    secretId: 'AZURE_AD_OAUTH',
    displayName: 'Microsoft Entra ID / Azure AD OAuth',
    fields: {
      clientId: 'z.string().describe("Azure AD client ID")',
      clientSecret: 'z.string().describe("Azure AD client secret")',
      tenantId: 'z.string().describe("Azure AD tenant ID")',
    },
  },
  okta: {
    importPath: '@auth/core/providers/okta',
    importName: 'Okta',
    secretId: 'OKTA_OAUTH',
    displayName: 'Okta OAuth',
    fields: {
      clientId: 'z.string().describe("Okta client ID")',
      clientSecret: 'z.string().describe("Okta client secret")',
      issuer: 'z.string().describe("Okta issuer URL")',
    },
  },
}
