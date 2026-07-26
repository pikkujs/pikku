# @pikku/express

Express server for Pikku, with CORS, cookie parsing, body parsing and a health
check already wired up.

Wraps `@pikku/express-middleware`. If you already have an Express app, use that
package directly instead — it avoids pulling in the server dependencies.

## Install

```bash
npm install @pikku/express
```

## Usage

```typescript
import { PikkuExpressServer } from '@pikku/express'

import './.pikku/pikku-bootstrap.gen.js'

const server = new PikkuExpressServer(config, logger)

await server.init()
await server.start()
```

`config.healthCheckPath` defaults to `/health-check`. The underlying Express
app is exposed as `server.app`.

## Docs

https://pikku.dev/docs
