---
name: pikku-deploy-cloudflare
description: 'Use when deploying a Pikku app to Cloudflare Workers. Covers HTTP fetch handler, scheduled tasks, and WebSocket via Durable Objects.
TRIGGER when: code imports @pikku/cloudflare, user mentions Cloudflare Workers deployment, or worker entry uses ExportedHandler/wrangler.toml.
DO NOT TRIGGER when: just defining functions/wirings without Cloudflare-specific code.'
installGroups: [fabric]
---

# Pikku Cloudflare Workers Deployment

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

```bash
yarn add @pikku/cloudflare
```

## Worker Entry

```typescript
import { runFetch, runScheduled } from '@pikku/cloudflare'
import { setupServices } from './setup-services.js'
import './.pikku/pikku-bootstrap.gen.js'

export default {
  async scheduled(controller, env) {
    await setupServices(env)
    await runScheduled(controller)
  },

  async fetch(request, env): Promise<Response> {
    await setupServices(env)
    return await runFetch(request as unknown as Request)
  },
} satisfies ExportedHandler<Record<string, string>>
```

## Service Setup

Cloudflare passes env variables per-request — wrap them with Pikku services:

```typescript
// setup-services.ts
import { LocalVariablesService, LocalSecretService } from '@pikku/core/services'
import { createConfig, createSingletonServices } from './services.js'

export const setupServices = async (env: Record<string, string | undefined>) => {
  const localVariables = new LocalVariablesService(env)
  const config = await createConfig(localVariables)
  const localSecrets = new LocalSecretService(localVariables)
  return await createSingletonServices(config, {
    variables: localVariables,
    secrets: localSecrets,
  })
}
```

## WebSocket (Durable Objects)

```typescript
import { CloudflareWebSocketHibernationServer } from '@pikku/cloudflare'

export class WebSocketHibernationServer extends CloudflareWebSocketHibernationServer {
  protected async getParams() {
    const singletonServices = await setupServices(this.env)
    return { singletonServices }
  }
}
```

Register the Durable Object in `wrangler.toml` and export from the worker entry.
