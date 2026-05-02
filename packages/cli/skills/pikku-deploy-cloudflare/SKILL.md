---
name: pikku-deploy-cloudflare
description: 'Use when deploying a Pikku app to Cloudflare Workers. Covers HTTP fetch handler, scheduled tasks, and WebSocket via Durable Objects.
TRIGGER when: code imports @pikku/cloudflare, user mentions Cloudflare Workers deployment, or worker entry uses ExportedHandler/wrangler.toml.
DO NOT TRIGGER when: just defining functions/wirings without Cloudflare-specific code.'
---

# Pikku Cloudflare Workers Deployment

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
