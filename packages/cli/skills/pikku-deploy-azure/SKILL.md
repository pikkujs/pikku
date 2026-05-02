---
name: pikku-deploy-azure
description: 'Use when deploying a Pikku app to Azure Functions. Covers PikkuAzFunctionsLogger and PikkuAzTimerRequest for Azure Functions runtime.
TRIGGER when: user asks about Azure Functions, Azure deployment, or @pikku/azure-functions.
DO NOT TRIGGER when: user asks about AWS Lambda (use pikku-deploy-lambda) or Cloudflare Workers (use pikku-deploy-cloudflare).'
---

# Pikku Azure Functions Deployment

`@pikku/azure-functions` provides Azure Functions runtime adapters for Pikku.

## Installation

```bash
yarn add @pikku/azure-functions @azure/functions
```

## API Reference

### `PikkuAzFunctionsLogger`

Logger implementation that integrates with Azure Functions' built-in logging context.

### `PikkuAzTimerRequest`

Timer trigger request handler for running Pikku scheduled functions as Azure Timer Triggers.

## Usage Patterns

### HTTP Function

```typescript
import { app } from '@azure/functions'
import { PikkuAzFunctionsLogger } from '@pikku/azure-functions'

app.http('api', {
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  route: '{*path}',
  handler: async (request, context) => {
    const logger = new PikkuAzFunctionsLogger(context)
    // Wire Pikku HTTP runner with Azure request/response
  },
})
```

### Timer Trigger

```typescript
import { app } from '@azure/functions'
import { PikkuAzTimerRequest } from '@pikku/azure-functions'

app.timer('scheduler', {
  schedule: '0 */5 * * * *',
  handler: async (timer, context) => {
    const request = new PikkuAzTimerRequest(timer)
    // Process scheduled Pikku functions
  },
})
```
