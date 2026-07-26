# @pikku/cloudflare

Cloudflare Workers runtime for Pikku — `fetch` and `scheduled` entry points,
Queues, D1 services and hibernating WebSocket Durable Objects.

## Install

```bash
npm install @pikku/cloudflare
```

## Usage

```typescript
import { runFetch } from '@pikku/cloudflare'

import './.pikku/pikku-bootstrap.gen.js'

export default {
  fetch: (request: Request) => runFetch(request),
}
```

Pass a `CloudflareWebSocketHibernationServer` as the second argument to
`runFetch` to handle WebSocket upgrades.

Use `@pikku/deploy-cloudflare` to provision Workers, Queues, D1 and R2.

## Docs

https://pikku.dev/docs
