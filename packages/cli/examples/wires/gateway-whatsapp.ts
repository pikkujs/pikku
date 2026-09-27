//~ name: gateway-whatsapp
//~ title: WhatsApp Business gateway (Meta Cloud API webhook) — inbound messages linked to app users
//~ when: The brief wants the app reachable over WhatsApp — a business number users message, a WhatsApp bot/assistant, order updates over WhatsApp. Business tier ONLY (Meta Cloud API webhook — deploys everywhere); never Baileys (personal-tier listener, does not deploy). Install first: `bun add @pikku/addon-whatsapp`.
//~ steps:
//~ PREREQS (do these first, they are not optional):
//~ 1. `bun add @pikku/addon-whatsapp` — ships the adapter, the Cloud API service,
//~    and the `WHATSAPP_CREDENTIALS` defineSecret (accessToken, phoneNumberId,
//~    verifyToken). Because it is a defineSecret, the platform AUTOMATICALLY shows
//~    it as blocked-until-set in the project's Secrets dashboard and deploy gate —
//~    do NOT enumerate secret fields in chat, just build.
//~ 2. Migration — sender identities link to app users via a dedicated table
//~    (db/sqlite/NNNN-gateway-identity.sql at the PROJECT ROOT):
//~      CREATE TABLE gateway_identity (
//~        channel TEXT NOT NULL,
//~        external_id TEXT NOT NULL,
//~        user_id TEXT NOT NULL REFERENCES user(id),
//~        created_at TEXT NOT NULL DEFAULT (datetime('now')),
//~        PRIMARY KEY (channel, external_id)
//~      );
//~    Run `pikku db migrate` after writing it.
//~ 3. Register `<your public origin>` + the route below as the webhook URL in the
//~    Meta dashboard. Meta sends a GET challenge first; the adapter answers it
//~    automatically once WHATSAPP_CREDENTIALS is set.
import type { GatewayInboundMessage } from '@pikku/core/gateway'
import { wireGateway } from '@pikku/core/gateway'
import {
  WhatsAppGatewayAdapter,
  WhatsappService,
  whatsappSecretsSchema,
} from '@pikku/addon-whatsapp'
import { pikkuSessionlessFunc } from '#pikku/function'

//~ HANDLER — a normal pikkuSessionlessFunc. The runner parses the Meta payload
//~ into a GatewayInboundMessage (senderId = the sender's phone number) BEFORE
//~ calling you; returning { text } auto-sends the reply back over WhatsApp.
//~ No zod input/output here — gateway handlers are wired by the runner, and the
//~ input type IS GatewayInboundMessage.
export const onWhatsAppMessage = pikkuSessionlessFunc({
  expose: false,
  description: 'Handle an inbound WhatsApp message',
  func: async ({ kysely, logger }, message: GatewayInboundMessage) => {
    const senderId = message.senderId
    const contactName = (message.metadata?.contactName as string | undefined) ?? senderId

    //~ LINK SENDER → APP USER. TWO POLICIES — the product brief decides which
    //~ (the planner asks when messaging is in scope). KEEP ONE, DELETE THE OTHER.
    const identity = await kysely
      .selectFrom('gatewayIdentity')
      .select(['userId'])
      .where('channel', '=', 'whatsapp')
      .where('externalId', '=', senderId)
      .executeTakeFirst()

    let userId = identity?.userId

    //~ POLICY A — OPEN (message creates the user): first message from an unknown
    //~ number creates a data-only app user (no password/account row — same idea
    //~ as seeded users; they can later claim the account via the app's own flow).
    if (!userId) {
      const user = await kysely
        .insertInto('user')
        .values({
          //~ match the app's user schema/annotations — these are the Better Auth
          //~ defaults; the synthetic unique email marks a gateway-born user.
          id: crypto.randomUUID(),
          name: contactName,
          email: `whatsapp-${senderId}@gateway.invalid`,
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning(['id'])
        .executeTakeFirstOrThrow()
      await kysely
        .insertInto('gatewayIdentity')
        .values({ channel: 'whatsapp', externalId: senderId, userId: user.id })
        .execute()
      userId = user.id
      logger.info(`whatsapp gateway: created user ${userId} for ${senderId}`)
    }

    //~ POLICY B — CLOSED (user must already exist): the app links numbers itself
    //~ (e.g. a "connect WhatsApp" screen inserting into gateway_identity, or an
    //~ admin doing it). Unknown sender → polite rejection, nothing created:
    // if (!userId) {
    //   return { text: 'This number is not registered. Please sign up in the app first.' }
    // }

    //~ DOMAIN LOGIC — everything below is the actual app: act on message.text
    //~ for the linked userId (create the order, answer the question, run the
    //~ agent...). Replace this echo with the brief's real behaviour.
    logger.info(`whatsapp gateway: ${userId} said ${message.text}`)
    return { text: `Got it, ${contactName}!` }
  },
})

//~ WIRING — in real code this lives in its own wires/gateway/whatsapp.wiring.ts
//~ (the handler above in its own *.function.ts). The adapter is a FACTORY
//~ (services) => adapter: it needs the Cloud API credentials, which only exist
//~ after boot; pikku resolves it lazily on the first webhook and caches it.
//~ Route is served at /api/gateways/whatsapp (webhook gateways are auth:false
//~ and register GET (Meta challenge) + POST).
wireGateway({
  name: 'whatsapp',
  type: 'webhook',
  route: '/gateways/whatsapp',
  adapter: async ({ secrets }) => {
    const creds = whatsappSecretsSchema.parse(
      (await secrets.getSecret('WHATSAPP_CREDENTIALS')).reveal(),
    )
    return new WhatsAppGatewayAdapter(new WhatsappService(creds), creds.verifyToken)
  },
  func: onWhatsAppMessage,
  auth: false,
})

//~ PROACTIVE sends (outside a reply — e.g. from a workflow or cron): call the
//~ addon's `messagesSend` function via rpc like any other addon function
//~ (`rpc.invoke('messagesSend', { to, text })`), or use wire.gateway.send inside
//~ the handler for multi-message replies. NEVER hand-roll fetch to
//~ graph.facebook.com.
