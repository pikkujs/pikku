---
name: pikku-deploy-azure
description: 'Use when deploying a Pikku app to Azure Functions. Covers PikkuAzFunctionsLogger and PikkuAzTimerRequest for Azure Functions runtime.
TRIGGER when: user asks about Azure Functions, Azure deployment, or @pikku/azure-functions.
DO NOT TRIGGER when: user asks about AWS Lambda (use pikku-deploy-lambda) or Cloudflare Workers (use pikku-deploy-cloudflare).'
---

# Pikku Azure Functions Deployment

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

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
