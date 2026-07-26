# @pikku/uws

uWebSockets.js server for Pikku, with health checks and HTTP plus WebSocket
routing wired up.

Wraps `@pikku/uws-handler` and depends on `uWebSockets.js` directly, which is a
native module. If you already have a uWS app, use the handler package instead.

## Install

```bash
npm install @pikku/uws
```

## Usage

```typescript
import { PikkuUWSServer } from '@pikku/uws'

import './.pikku/pikku-bootstrap.gen.js'

const server = new PikkuUWSServer(config, logger)

await server.init()
await server.start()
```

The underlying uWS app is exposed as `server.app`.

## Docs

https://pikku.dev/docs
