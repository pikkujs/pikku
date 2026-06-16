export interface AuthProviderVariable {
  variableId: string
  description: string
}

export interface AuthProviderDef {
  /** Secret key stored in SecretService — holds the provider's OAuth credentials
   *  (an object matching {@link AuthProviderDef.fields}). */
  secretId: string
  /** Human-readable name for the secret (shown in the platform UI). */
  displayName: string
  /** Secret schema fields: field name → zod type string. */
  fields: Record<string, string>
  /** Non-secret config variables (issuer, tenantId, etc.). */
  variables?: Record<string, AuthProviderVariable>
}

const clientId = 'z.string().describe("OAuth client ID")'
const clientSecret = 'z.string().describe("OAuth client secret")'
const standardFields = { clientId, clientSecret }

/** PROVIDER_KEY → KEY_OAUTH (e.g. `github` → `GITHUB_OAUTH`). */
const secretIdFor = (key: string) => `${key.replace(/-/g, '_').toUpperCase()}_OAUTH`

const oauth = (key: string, displayName: string): AuthProviderDef => ({
  secretId: secretIdFor(key),
  displayName,
  fields: standardFields,
})

/**
 * Maps better-auth `socialProviders` keys to the Pikku secret each provider
 * needs. The pikku CLI reads the `socialProviders` object keys from the user's
 * `betterAuth({...})` config and emits a `wireSecret` for each entry here, so
 * the platform knows which OAuth credentials to collect.
 *
 * Keys mirror better-auth's built-in social provider ids exactly. Providers not
 * listed here (or wired via the genericOAuth plugin) are skipped by codegen — a
 * warning is logged so the secret can be added manually.
 *
 * Convention: the user reads `secretId` off `services.secrets` and spreads it
 * into the provider config, e.g.
 * `github: await services.secrets.getSecret('GITHUB_OAUTH')`.
 */
export const PROVIDER_REGISTRY = {
  apple: oauth('apple', 'Apple OAuth'),
  atlassian: oauth('atlassian', 'Atlassian OAuth'),
  cognito: {
    ...oauth('cognito', 'AWS Cognito OAuth'),
    variables: {
      domain: {
        variableId: 'COGNITO_DOMAIN',
        description:
          'Cognito user pool domain (e.g. your-domain.auth.us-east-1.amazoncognito.com)',
      },
      region: {
        variableId: 'COGNITO_REGION',
        description: 'AWS region the Cognito user pool is hosted in (e.g. us-east-1)',
      },
      userPoolId: {
        variableId: 'COGNITO_USER_POOL_ID',
        description: 'Cognito user pool id (e.g. us-east-1_xxxxxxxxx)',
      },
    },
  },
  discord: oauth('discord', 'Discord OAuth'),
  dropbox: oauth('dropbox', 'Dropbox OAuth'),
  facebook: oauth('facebook', 'Facebook OAuth'),
  figma: oauth('figma', 'Figma OAuth'),
  github: oauth('github', 'GitHub OAuth'),
  gitlab: oauth('gitlab', 'GitLab OAuth'),
  google: oauth('google', 'Google OAuth'),
  huggingface: oauth('huggingface', 'Hugging Face OAuth'),
  kakao: oauth('kakao', 'Kakao OAuth'),
  kick: oauth('kick', 'Kick OAuth'),
  line: oauth('line', 'LINE OAuth'),
  linear: oauth('linear', 'Linear OAuth'),
  linkedin: oauth('linkedin', 'LinkedIn OAuth'),
  microsoft: {
    ...oauth('microsoft', 'Microsoft Entra ID OAuth'),
    variables: {
      tenantId: {
        variableId: 'MICROSOFT_TENANT_ID',
        description: 'Microsoft Entra ID tenant ID (or "common")',
      },
    },
  },
  naver: oauth('naver', 'Naver OAuth'),
  notion: oauth('notion', 'Notion OAuth'),
  paypal: oauth('paypal', 'PayPal OAuth'),
  polar: oauth('polar', 'Polar OAuth'),
  railway: oauth('railway', 'Railway OAuth'),
  reddit: oauth('reddit', 'Reddit OAuth'),
  roblox: oauth('roblox', 'Roblox OAuth'),
  salesforce: oauth('salesforce', 'Salesforce OAuth'),
  slack: oauth('slack', 'Slack OAuth'),
  spotify: oauth('spotify', 'Spotify OAuth'),
  tiktok: {
    secretId: secretIdFor('tiktok'),
    displayName: 'TikTok OAuth',
    // TikTok uses `clientKey` rather than `clientId`.
    fields: { clientKey: 'z.string().describe("OAuth client key")', clientSecret },
  },
  twitch: oauth('twitch', 'Twitch OAuth'),
  twitter: oauth('twitter', 'Twitter / X OAuth'),
  vercel: oauth('vercel', 'Vercel OAuth'),
  vk: oauth('vk', 'VK OAuth'),
  wechat: oauth('wechat', 'WeChat OAuth'),
  zoom: oauth('zoom', 'Zoom OAuth'),
} satisfies Record<string, AuthProviderDef>

export type AuthProvider = keyof typeof PROVIDER_REGISTRY
