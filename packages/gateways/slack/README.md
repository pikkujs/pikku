# @pikku/gateway-slack

Slack gateway for Pikku. Bridges the Slack Events API into Pikku's gateway
system, with helpers for OAuth, slash commands and message formatting.

## Install

```bash
npm install @pikku/gateway-slack
```

## Usage

```typescript
import { verifySlackSignature } from '@pikku/gateway-slack'

const valid = verifySlackSignature(signingSecret, headers, rawBody)
```

Register the adapter as a gateway so Slack events dispatch to your Pikku
functions.

## Docs

https://pikku.dev/docs
