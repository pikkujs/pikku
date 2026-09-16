//~ name: gateway-slack
//~ title: Slack gateway (Events API webhook) — bot messages linked to app users
//~ when: The brief wants the app reachable from Slack — a workspace bot users DM or @mention, notifications with replies, a support channel. Install first: `bun add @pikku/gateway-slack @slack/web-api`.
//~ steps:
//~ PREREQS:
//~ 1. `bun add @pikku/gateway-slack @slack/web-api`.
//~ 2. Same gateway_identity migration as the whatsapp scaffold (shared table,
//~    different channel value) — see {name: gateway-whatsapp} for the SQL.
//~ 3. In the Slack app: set `<your public origin>` + the route below as the Event
//~    Subscriptions request URL, subscribe to the `message.im` and `app_mention`
//~    bot events, and install. Slack's url_verification challenge is answered
//~    automatically once SLACK_CREDENTIALS is set.
//~    Do NOT enumerate secret fields in chat — the defineSecret below surfaces
//~    them as blocked-until-set in the Secrets dashboard automatically.
import { z } from 'zod'
import type { GatewayInboundMessage } from '@pikku/core/gateway'
import { wireGateway } from '@pikku/core/gateway'
import { defineSecret } from '#pikku/secrets'
import { SlackGatewayAdapter, SlackGatewayHelper } from '@pikku/gateway-slack'
import { pikkuSessionlessFunc } from '#pikku/function'

//~ SECRET — in real code the zod schema lives in lib/slack-secret-schema.ts
//~ with NO wire* calls in that file (mixing them is a PKU490 codegen error);
//~ the defineSecret + wireGateway go together in wires/gateway/slack.wiring.ts.
//~ accessToken = the bot token (xoxb-…), signingSecret = the app's signing
//~ secret; the adapter REJECTS unsigned/forged webhooks with it.
export const slackSecretsSchema = z.object({
  accessToken: z.string().describe('Slack bot token (xoxb-…)'),
  signingSecret: z
    .string()
    .describe('Slack app signing secret — verifies inbound webhook signatures'),
})

defineSecret({
  name: 'slack',
  displayName: 'Slack app',
  description: 'Slack bot credentials for the messaging gateway',
  secretId: 'SLACK_CREDENTIALS',
  schema: slackSecretsSchema,
})

//~ The adapter instance is kept module-level because replies need it:
//~ SlackGatewayAdapter.send() is a NO-OP (no channel context), so returning
//~ { text } from the handler does NOTHING on Slack — always reply through
//~ SlackGatewayHelper, which binds team/channel/thread from the message.
let slackAdapter: SlackGatewayAdapter

//~ HANDLER — senderId is the Slack user ID (e.g. U0123…). The runner already
//~ filtered bot echoes/edits; only real user messages and @mentions arrive here.
export const onSlackMessage = pikkuSessionlessFunc({
  expose: false,
  description: 'Handle an inbound Slack message',
  func: async ({ kysely, logger }, message: GatewayInboundMessage) => {
    const senderId = message.senderId
    const slack = new SlackGatewayHelper(message, slackAdapter)

    //~ LINK SENDER → APP USER — same two policies as the whatsapp scaffold
    //~ (the brief decides; KEEP ONE):
    const identity = await kysely
      .selectFrom('gatewayIdentity')
      .select(['userId'])
      .where('channel', '=', 'slack')
      .where('externalId', '=', senderId)
      .executeTakeFirst()

    let userId = identity?.userId

    //~ POLICY A — OPEN (message creates the user):
    if (!userId) {
      const user = await kysely
        .insertInto('user')
        .values({
          id: crypto.randomUUID(),
          name: senderId,
          email: `slack-${senderId}@gateway.invalid`,
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning(['id'])
        .executeTakeFirstOrThrow()
      await kysely
        .insertInto('gatewayIdentity')
        .values({ channel: 'slack', externalId: senderId, userId: user.id })
        .execute()
      userId = user.id
      logger.info(`slack gateway: created user ${userId} for ${senderId}`)
    }

    //~ POLICY B — CLOSED (user must already exist):
    // if (!userId) {
    //   await slack.sendText('This Slack account is not linked yet — connect it in the app first.')
    //   return
    // }

    //~ DOMAIN LOGIC — act on message.text for userId, then reply IN-THREAD via
    //~ the helper (never `return { text }` — see the no-op note above):
    logger.info(`slack gateway: ${userId} said ${message.text}`)
    await slack.sendText(`Got it, <@${senderId}>!`)
  },
})

//~ WIRING — lives in wires/gateway/slack.wiring.ts together with the
//~ defineSecret above (importing the schema from lib/ — see PKU490 note).
//~ The adapter is a FACTORY resolved lazily at the first webhook: credentials
//~ only exist after boot. Signature verification is enforced by the adapter on
//~ EVERY request (invalid/missing/stale → 401) before your handler runs.
wireGateway({
  name: 'slack',
  type: 'webhook',
  route: '/gateways/slack',
  adapter: async ({ secrets }) => {
    const creds = slackSecretsSchema.parse((await secrets.getSecret('SLACK_CREDENTIALS')).reveal())
    slackAdapter = new SlackGatewayAdapter({
      signingSecret: creds.signingSecret,
      //~ single-workspace app: one bot token. Multi-workspace → look the token
      //~ up per teamId from your own table here instead.
      tokenResolver: async () => creds.accessToken,
    })
    return slackAdapter
  },
  func: onSlackMessage,
  auth: false,
})

//~ Slash commands / proactive posts: parseSlashCommand + respondToSlashCommand
//~ and the OAuth helpers also ship in @pikku/gateway-slack; wire a slash-command
//~ route only when the brief asks for one.
