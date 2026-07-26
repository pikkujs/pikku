# @pikku/uws-handler

uWebSockets.js HTTP and WebSocket handlers for Pikku. Attach them to a uWS app
you already own.

Takes `uWebSockets.js` as a peer dependency, so installing this package does not
build the native binary on your behalf. For a ready-made server use
`@pikku/uws`.

## Install

```bash
npm install @pikku/uws-handler
```

## Usage

```typescript
import uWS from 'uWebSockets.js'
import { pikkuHTTPHandler } from '@pikku/uws-handler'

import './.pikku/pikku-bootstrap.gen.js'

const app = uWS.App()

app.any('/*', pikkuHTTPHandler({ logger, loadSchemas: true }))
```

## Docs

https://pikku.dev/docs
