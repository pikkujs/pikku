# @pikku/ws

WebSocket server for Pikku, built on `ws`. Use it to serve Pikku channels
alongside an existing `node:http` server.

## Install

```bash
npm install @pikku/ws ws
```

## Usage

```typescript
import { WebSocketServer } from 'ws'
import { pikkuWebsocketHandler } from '@pikku/ws'

import './.pikku/pikku-bootstrap.gen.js'

const wss = new WebSocketServer({ server })

pikkuWebsocketHandler({ server, wss, logger, loadSchemas: true })
```

## Docs

https://pikku.dev/docs
