# @pikku/node-http-server

Pikku server built on `node:http`, with no third-party server dependency. This
is what `pikku dev` runs, and what container deployments use.

Includes request hardening defaults (header and request timeouts), graceful
shutdown, and optional MCP support.

## Install

```bash
npm install @pikku/node-http-server
```

## Usage

```typescript
import { PikkuNodeHTTPServer } from '@pikku/node-http-server'

import './.pikku/pikku-bootstrap.gen.js'

const server = new PikkuNodeHTTPServer(config, logger)

await server.init()
await server.start()
```

The underlying `http.Server` is exposed as `server.server`.

## Docs

https://pikku.dev/docs
