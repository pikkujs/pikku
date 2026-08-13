/**
 * Slack gateway adapter for Pikku.
 *
 * Provides a `GatewayAdapter` implementation that bridges Slack Events API
 * with Pikku's gateway system, plus helpers for OAuth, slash commands,
 * and message formatting.
 *
 * @module @pikku/gateway-slack
 */
export {
  SlackGatewayAdapter,
} from './slack-gateway-adapter.js'
export {
  SlackGatewayHelper,
} from './slack-gateway-helper.js'
export {
  parseSlashCommand,
  respondToSlashCommand,
  type ParsedSlashCommand,
  type SlackCommandResponse,
} from './slack-commands.js'
export {
  exchangeSlackOAuthCode,
  buildSlackInstallUrl,
  RECOMMENDED_BOT_SCOPES,
  type SlackOAuthResult,
} from './slack-oauth.js'
export { verifySlackSignature } from './slack-signature.js'
