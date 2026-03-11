import { WebClient } from '@slack/web-api'

/**
 * Result of a successful Slack OAuth exchange.
 */
export interface SlackOAuthResult {
  teamId: string
  teamName: string
  botToken: string
  botUserId: string
  appId: string
  authedUserId: string
  scope: string
}

/**
 * Exchange a Slack OAuth code for a bot token.
 */
export async function exchangeSlackOAuthCode(options: {
  clientId: string
  clientSecret: string
  code: string
  redirectUri?: string
}): Promise<SlackOAuthResult> {
  const client = new WebClient()
  const result = await client.oauth.v2.access({
    client_id: options.clientId,
    client_secret: options.clientSecret,
    code: options.code,
    redirect_uri: options.redirectUri,
  })

  if (!result.ok) {
    throw new Error(`Slack OAuth failed: ${result.error}`)
  }

  return {
    teamId: result.team?.id as string,
    teamName: result.team?.name as string,
    botToken: result.access_token as string,
    botUserId: result.bot_user_id as string,
    appId: result.app_id as string,
    authedUserId: result.authed_user?.id as string,
    scope: result.scope as string,
  }
}

/**
 * Build the Slack OAuth install URL.
 */
export function buildSlackInstallUrl(options: {
  clientId: string
  scopes: string[]
  redirectUri?: string
  state?: string
}): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    scope: options.scopes.join(','),
    ...(options.redirectUri && { redirect_uri: options.redirectUri }),
    ...(options.state && { state: options.state }),
  })
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`
}

/**
 * Recommended bot scopes for an agent integration.
 */
export const RECOMMENDED_BOT_SCOPES = [
  'app_mentions:read',
  'channels:history',
  'channels:read',
  'chat:write',
  'commands',
  'groups:history',
  'groups:read',
  'im:history',
  'im:read',
  'im:write',
  'users:read',
]
