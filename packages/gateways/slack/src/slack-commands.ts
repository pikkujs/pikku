/**
 * Slack slash command payload (URL-encoded form data parsed into object).
 */
export interface SlackSlashCommand {
  token: string
  team_id: string
  team_domain: string
  channel_id: string
  channel_name: string
  user_id: string
  user_name: string
  command: string
  text: string
  response_url: string
  trigger_id: string
}

/**
 * Parsed slash command with subcommand and arguments.
 */
export interface ParsedSlashCommand {
  /** The raw slash command payload */
  raw: SlackSlashCommand
  /** First word after the command (e.g., "install" from "/agentifier install addon") */
  subcommand: string
  /** Remaining text after the subcommand */
  args: string
  /** Individual argument tokens */
  argsList: string[]
  /** Team/workspace ID */
  teamId: string
  /** User who invoked the command */
  userId: string
  /** Channel where command was invoked */
  channelId: string
  /** Trigger ID for opening modals */
  triggerId: string
  /** URL for async responses */
  responseUrl: string
}

/**
 * Parse a Slack slash command payload into a structured format.
 */
export function parseSlashCommand(data: unknown): ParsedSlashCommand {
  const cmd = data as SlackSlashCommand
  const parts = (cmd.text || '').trim().split(/\s+/)
  const subcommand = parts[0] || ''
  const argsList = parts.slice(1)

  return {
    raw: cmd,
    subcommand,
    args: argsList.join(' '),
    argsList,
    teamId: cmd.team_id,
    userId: cmd.user_id,
    channelId: cmd.channel_id,
    triggerId: cmd.trigger_id,
    responseUrl: cmd.response_url,
  }
}

/**
 * Slack slash command response format.
 */
export interface SlackCommandResponse {
  response_type?: 'in_channel' | 'ephemeral'
  text?: string
  blocks?: unknown[]
}

/**
 * Send a delayed response to a slash command via the response_url.
 * Useful when processing takes longer than 3 seconds.
 */
export async function respondToSlashCommand(
  responseUrl: string,
  response: SlackCommandResponse
): Promise<void> {
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(response),
  })
}
