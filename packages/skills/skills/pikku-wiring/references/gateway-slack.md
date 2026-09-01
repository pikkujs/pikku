# Pikku Gateway Slack

## Installation

```bash
yarn add @pikku/gateway-slack @slack/web-api
```

## API Reference

### `SlackGatewayAdapter`

```typescript
import { SlackGatewayAdapter } from '@pikku/gateway-slack'

const adapter = new SlackGatewayAdapter({
  signingSecret: string,
  tokenResolver: (teamId: string) => Promise<string | null>,
})
```

Bridges Slack Events API webhooks with Pikku's gateway system for processing Slack events as Pikku functions.

**There is no `botToken` option.** One adapter serves every workspace, and the
bot token is resolved per `team_id` through `tokenResolver` — normally a lookup
against the row `exchangeSlackOAuthCode` wrote at install time. Returning `null`
throws for that event. `WebClient`s are cached per team, so call
`invalidateClient(teamId)` after a token rotation.

**Methods:**

- `verifyWebhook(data, request?)` — asserts the signature, then answers the `url_verification` challenge. It **fails closed**: no request access, missing headers, a stale timestamp, or an HMAC mismatch all throw `UnauthorizedError` before parse or the handler runs
- `parse(data)` — normalizes an `event_callback` into a `GatewayInboundMessage`, or returns `null` for anything to ignore
- `createBoundSend(teamId, channelId, threadTs?)` — the real send path
- `send(senderId, message)` — **a deliberate no-op.** The generic signature carries no channel context, and the gateway runner calls it for auto-send, so it swallows rather than throws. A reply written through it silently never reaches Slack
- `getClientForTeam(teamId)` / `invalidateClient(teamId)` / `close()`

`parse` returns `null` — meaning the event is dropped — for anything that isn't a
`message` or `app_mention`, for bot messages (loop prevention), for any subtype
other than `thread_broadcast`, and for events with no `user` or no `text`.
`metadata` carries `{ teamId, channelId, threadTs, messageTs, eventType }`, with
`threadTs` falling back to the message's own `ts` so replies always land
in-thread.

### `SlackGatewayHelper`

Wraps a parsed message plus the adapter and binds the channel/thread for you:

```typescript
const slack = new SlackGatewayHelper(data, adapter)
await slack.sendText('Thinking…') // sends now
return slack.reply('Here is the answer') // auto-sent by the runner
```

Also: `send(message)`, `replyBlocks(blocks)`, and the `channelId` / `threadTs` /
`teamId` getters.

### Slash Commands

```typescript
import { parseSlashCommand, respondToSlashCommand } from '@pikku/gateway-slack'

const command = parseSlashCommand(data)
// { raw, subcommand, args, argsList, teamId, userId, channelId, triggerId, responseUrl }
await respondToSlashCommand(command.responseUrl, { text: 'Done!' })
```

The parsed result is camelCase — reach for `command.responseUrl`, not
`command.response_url`; the underlying snake_case payload is on `command.raw`.
`text` is split on whitespace: the first word becomes `subcommand`, the rest
`args`/`argsList`.

`respondToSlashCommand` posts to the `response_url` and **ignores the result** —
a rejected response is invisible. Use it for the delayed reply when work exceeds
Slack's 3-second acknowledgement window.

### OAuth Flow

```typescript
import {
  buildSlackInstallUrl,
  exchangeSlackOAuthCode,
  RECOMMENDED_BOT_SCOPES,
} from '@pikku/gateway-slack'

const installUrl = buildSlackInstallUrl({
  clientId: config.slackClientId,
  scopes: RECOMMENDED_BOT_SCOPES,
  redirectUri: config.slackRedirectUri,
})

const tokens = await exchangeSlackOAuthCode({
  clientId: config.slackClientId,
  clientSecret: config.slackClientSecret,
  code: oauthCode,
  redirectUri: config.slackRedirectUri,
})
```

### Signature Verification

```typescript
import { verifySlackSignature } from '@pikku/gateway-slack'

verifySlackSignature(signingSecret, signature, timestamp, body): boolean
```

**Signature before timestamp** — the two middle arguments are both strings, so
swapping them compiles and simply never verifies. `signature` is the raw
`x-slack-signature` header (`v0=…`), `timestamp` is `x-slack-request-timestamp`
in Unix seconds, and `body` must be the **raw** request body: any re-serialization
changes the HMAC.

It returns `false` rather than throwing, including for a timestamp more than 5
minutes off (replay protection). The adapter already calls this for you — reach
for it directly only outside the gateway path, e.g. in a slash-command route.

## Usage Patterns

### Slack Bot Gateway

```typescript
import { SlackGatewayAdapter } from '@pikku/gateway-slack'

const slackGateway = new SlackGatewayAdapter({
  signingSecret: config.slackSigningSecret,
  tokenResolver: async (teamId) => {
    const row = await kysely
      .selectFrom('slackInstall')
      .select('botToken')
      .where('teamId', '=', teamId)
      .executeTakeFirst()
    return row?.botToken ?? null
  },
})
```

### Slash Command Handler

Slack gives you 3 seconds to acknowledge, so anything slower answers immediately
and posts the real result to `responseUrl` afterwards:

```typescript
const handleSlashCommand = pikkuSessionlessFunc({
  title: 'Handle Slack Command',
  func: async ({ db }, data) => {
    const command = parseSlashCommand(data)
    await respondToSlashCommand(command.responseUrl, {
      text: `Processed: ${command.args}`,
      response_type: 'ephemeral',
    })
  },
})
```
