---
name: pikku-gateway-slack
description: >-
  Use when integrating Slack with a Pikku app. Covers SlackGatewayAdapter, slash commands, OAuth
  flow, message handling, and signature verification. TRIGGER when: code uses SlackGatewayAdapter,
  parseSlashCommand, buildSlackInstallUrl, or user asks about Slack integration, Slack bots, or
  @pikku/gateway-slack. DO NOT TRIGGER when: user asks about general gateway/webhook patterns (use
  pikku-trigger).
---

# Pikku Gateway Slack

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

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
