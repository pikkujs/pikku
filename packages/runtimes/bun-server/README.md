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

## Idle timeout

Bun closes a connection after 10 seconds without traffic. That cuts quiet SSE
streams whose heartbeat is slower than that. Raise it with `idleTimeout`
(seconds, max 255, `0` disables) in the server config; when unset Bun's default
is kept:

```typescript
const server = new PikkuBunServer({ ...config, idleTimeout: 60 }, logger)
```

## Docs

https://pikku.dev/docs
