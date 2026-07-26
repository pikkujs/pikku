# @pikku/bun-server

Pikku server for Bun, built on `Bun.serve`. Includes a Bun-native event hub and
optional MCP support.

For Node use `@pikku/node-http-server`.

## Install

```bash
bun add @pikku/bun-server
```

## Usage

```typescript
import { PikkuBunServer } from '@pikku/bun-server'

import './.pikku/pikku-bootstrap.gen.js'

const server = new PikkuBunServer(config, logger)

await server.init()
await server.start()
```

Pass `{ eventHub, mcpJson, mcpPath }` as the third argument to override the
default `BunEventHubService` or enable MCP.

## Docs

https://pikku.dev/docs
