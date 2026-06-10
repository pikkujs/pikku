export interface AuthProviderVariable {
  variableId: string
  description: string
}

export interface AuthProviderDef {
  /** Import path for the provider */
  importPath: string
  /** Default export name */
  importName: string
  /** Secret key stored in SecretService — holds clientId + clientSecret */
  secretId: string
  /** Display name for the secret */
  displayName: string
  /** Secret schema fields: field name → zod type string */
  fields: Record<string, string>
  /** Non-secret config variables (issuer, tenantId, etc.) */
  variables?: Record<string, AuthProviderVariable>
}

const clientIdSecret = 'z.string().describe("OAuth client ID")'
const clientSecretSecret = 'z.string().describe("OAuth client secret")'
const standardFields = {
  clientId: clientIdSecret,
  clientSecret: clientSecretSecret,
}

export const PROVIDER_REGISTRY = {
  github: {
    importPath: '@auth/core/providers/github',
    importName: 'GitHub',
    secretId: 'GITHUB_OAUTH',
    displayName: 'GitHub OAuth',
    fields: standardFields,
  },
  google: {
    importPath: '@auth/core/providers/google',
    importName: 'Google',
    secretId: 'GOOGLE_OAUTH',
    displayName: 'Google OAuth',
    fields: standardFields,
  },
  discord: {
    importPath: '@auth/core/providers/discord',
    importName: 'Discord',
    secretId: 'DISCORD_OAUTH',
    displayName: 'Discord OAuth',
    fields: standardFields,
  },
  twitter: {
    importPath: '@auth/core/providers/twitter',
    importName: 'Twitter',
    secretId: 'TWITTER_OAUTH',
    displayName: 'Twitter / X OAuth',
    fields: standardFields,
  },
  apple: {
    importPath: '@auth/core/providers/apple',
    importName: 'Apple',
    secretId: 'APPLE_OAUTH',
    displayName: 'Apple OAuth',
    fields: standardFields,
  },
  facebook: {
    importPath: '@auth/core/providers/facebook',
    importName: 'Facebook',
    secretId: 'FACEBOOK_OAUTH',
    displayName: 'Facebook OAuth',
    fields: standardFields,
  },
  linkedin: {
    importPath: '@auth/core/providers/linkedin',
    importName: 'LinkedIn',
    secretId: 'LINKEDIN_OAUTH',
    displayName: 'LinkedIn OAuth',
    fields: standardFields,
  },
  slack: {
    importPath: '@auth/core/providers/slack',
    importName: 'Slack',
    secretId: 'SLACK_OAUTH',
    displayName: 'Slack OAuth',
    fields: standardFields,
  },
  spotify: {
    importPath: '@auth/core/providers/spotify',
    importName: 'Spotify',
    secretId: 'SPOTIFY_OAUTH',
    displayName: 'Spotify OAuth',
    fields: standardFields,
  },
  twitch: {
    importPath: '@auth/core/providers/twitch',
    importName: 'Twitch',
    secretId: 'TWITCH_OAUTH',
    displayName: 'Twitch OAuth',
    fields: standardFields,
  },
  gitlab: {
    importPath: '@auth/core/providers/gitlab',
    importName: 'GitLab',
    secretId: 'GITLAB_OAUTH',
    displayName: 'GitLab OAuth',
    fields: standardFields,
  },
  reddit: {
    importPath: '@auth/core/providers/reddit',
    importName: 'Reddit',
    secretId: 'REDDIT_OAUTH',
    displayName: 'Reddit OAuth',
    fields: standardFields,
  },
  notion: {
    importPath: '@auth/core/providers/notion',
    importName: 'Notion',
    secretId: 'NOTION_OAUTH',
    displayName: 'Notion OAuth',
    fields: standardFields,
  },
  instagram: {
    importPath: '@auth/core/providers/instagram',
    importName: 'Instagram',
    secretId: 'INSTAGRAM_OAUTH',
    displayName: 'Instagram OAuth',
    fields: standardFields,
  },
  zoom: {
    importPath: '@auth/core/providers/zoom',
    importName: 'Zoom',
    secretId: 'ZOOM_OAUTH',
    displayName: 'Zoom OAuth',
    fields: standardFields,
  },
  figma: {
    importPath: '@auth/core/providers/figma',
    importName: 'Figma',
    secretId: 'FIGMA_OAUTH',
    displayName: 'Figma OAuth',
    fields: standardFields,
  },
  tiktok: {
    importPath: '@auth/core/providers/tiktok',
    importName: 'TikTok',
    secretId: 'TIKTOK_OAUTH',
    displayName: 'TikTok OAuth',
    fields: standardFields,
  },
  threads: {
    importPath: '@auth/core/providers/threads',
    importName: 'Threads',
    secretId: 'THREADS_OAUTH',
    displayName: 'Threads OAuth',
    fields: standardFields,
  },
  patreon: {
    importPath: '@auth/core/providers/patreon',
    importName: 'Patreon',
    secretId: 'PATREON_OAUTH',
    displayName: 'Patreon OAuth',
    fields: standardFields,
  },
  dropbox: {
    importPath: '@auth/core/providers/dropbox',
    importName: 'Dropbox',
    secretId: 'DROPBOX_OAUTH',
    displayName: 'Dropbox OAuth',
    fields: standardFields,
  },
  bitbucket: {
    importPath: '@auth/core/providers/bitbucket',
    importName: 'Bitbucket',
    secretId: 'BITBUCKET_OAUTH',
    displayName: 'Bitbucket OAuth',
    fields: standardFields,
  },
  hubspot: {
    importPath: '@auth/core/providers/hubspot',
    importName: 'HubSpot',
    secretId: 'HUBSPOT_OAUTH',
    displayName: 'HubSpot OAuth',
    fields: standardFields,
  },
  salesforce: {
    importPath: '@auth/core/providers/salesforce',
    importName: 'Salesforce',
    secretId: 'SALESFORCE_OAUTH',
    displayName: 'Salesforce OAuth',
    fields: standardFields,
  },
  atlassian: {
    importPath: '@auth/core/providers/atlassian',
    importName: 'Atlassian',
    secretId: 'ATLASSIAN_OAUTH',
    displayName: 'Atlassian OAuth',
    fields: standardFields,
  },
  strava: {
    importPath: '@auth/core/providers/strava',
    importName: 'Strava',
    secretId: 'STRAVA_OAUTH',
    displayName: 'Strava OAuth',
    fields: standardFields,
  },
  auth0: {
    importPath: '@auth/core/providers/auth0',
    importName: 'Auth0',
    secretId: 'AUTH0_OAUTH',
    displayName: 'Auth0',
    fields: standardFields,
    variables: {
      issuer: {
        variableId: 'AUTH0_ISSUER',
        description: 'Auth0 tenant URL (e.g. https://my-tenant.auth0.com)',
      },
    },
  },
  okta: {
    importPath: '@auth/core/providers/okta',
    importName: 'Okta',
    secretId: 'OKTA_OAUTH',
    displayName: 'Okta OAuth',
    fields: standardFields,
    variables: {
      issuer: {
        variableId: 'OKTA_ISSUER',
        description: 'Okta issuer URL (e.g. https://dev-123.okta.com)',
      },
    },
  },
  'azure-ad': {
    importPath: '@auth/core/providers/microsoft-entra-id',
    importName: 'MicrosoftEntraId',
    secretId: 'AZURE_AD_OAUTH',
    displayName: 'Microsoft Entra ID / Azure AD OAuth',
    fields: standardFields,
    variables: {
      tenantId: {
        variableId: 'AZURE_AD_TENANT_ID',
        description: 'Azure AD tenant ID',
      },
    },
  },
  'microsoft-entra-id': {
    importPath: '@auth/core/providers/microsoft-entra-id',
    importName: 'MicrosoftEntraId',
    secretId: 'MICROSOFT_ENTRA_ID_OAUTH',
    displayName: 'Microsoft Entra ID OAuth',
    fields: standardFields,
    variables: {
      tenantId: {
        variableId: 'MICROSOFT_ENTRA_ID_TENANT_ID',
        description: 'Microsoft Entra ID tenant ID',
      },
    },
  },
  keycloak: {
    importPath: '@auth/core/providers/keycloak',
    importName: 'Keycloak',
    secretId: 'KEYCLOAK_OAUTH',
    displayName: 'Keycloak OAuth',
    fields: standardFields,
    variables: {
      issuer: {
        variableId: 'KEYCLOAK_ISSUER',
        description:
          'Keycloak realm URL (e.g. https://auth.example.com/realms/myrealm)',
      },
    },
  },
  cognito: {
    importPath: '@auth/core/providers/cognito',
    importName: 'Cognito',
    secretId: 'COGNITO_OAUTH',
    displayName: 'AWS Cognito OAuth',
    fields: standardFields,
    variables: {
      issuer: {
        variableId: 'COGNITO_ISSUER',
        description:
          'Cognito user pool URL (e.g. https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc123)',
      },
    },
  },
} satisfies Record<string, AuthProviderDef>
