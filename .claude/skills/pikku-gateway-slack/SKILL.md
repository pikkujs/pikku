---
name: pikku-gateway-slack
description: 'Use when integrating Slack with a Pikku app. Covers SlackGatewayAdapter, slash commands, OAuth flow, message handling, and signature verification.
TRIGGER when: code uses SlackGatewayAdapter, parseSlashCommand, buildSlackInstallUrl, or user asks about Slack integration, Slack bots, or @pikku/gateway-slack.
DO NOT TRIGGER when: user asks about general gateway/webhook patterns (use pikku-trigger).'
---

# Pikku Gateway Slack

`@pikku/gateway-slack` provides a Slack Events API gateway adapter, slash command handling, OAuth installation flow, and message utilities.

## Installation

```bash
yarn add @pikku/gateway-slack @slack/web-api
```

## API Reference

### `SlackGatewayAdapter`

```typescript
import { SlackGatewayAdapter } from '@pikku/gateway-slack'

const adapter = new SlackGatewayAdapter(options: SlackGatewayAdapterOptions)
```

Bridges Slack Events API webhooks with Pikku's gateway system for processing Slack events as Pikku functions.

### `SlackGatewayHelper`

Helper for handling Slack messages and metadata within gateway functions.

### Slash Commands

```typescript
import { parseSlashCommand, respondToSlashCommand } from '@pikku/gateway-slack'

const command = parseSlashCommand(request)
await respondToSlashCommand(responseUrl, { text: 'Done!' })
```

### OAuth Flow

```typescript
import { buildSlackInstallUrl, exchangeSlackOAuthCode, RECOMMENDED_BOT_SCOPES } from '@pikku/gateway-slack'

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

verifySlackSignature(signingSecret, timestamp, body, signature)
```

## Usage Patterns

### Slack Bot Gateway

```typescript
import { SlackGatewayAdapter } from '@pikku/gateway-slack'

const slackGateway = new SlackGatewayAdapter({
  signingSecret: config.slackSigningSecret,
  botToken: config.slackBotToken,
})

// Register with your HTTP runner to handle /slack/events endpoint
```

### Slash Command Handler

```typescript
const handleSlashCommand = pikkuSessionlessFunc({
  title: 'Handle Slack Command',
  func: async ({ db }, data) => {
    const command = parseSlashCommand(data)
    // Process command...
    await respondToSlashCommand(command.response_url, {
      text: `Processed: ${command.text}`,
    })
  },
})
```
