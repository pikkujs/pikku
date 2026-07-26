# @pikku/express-middleware

Express middleware for Pikku. Mounts your Pikku wirings onto an Express app you
already own.

Takes `express` as a peer dependency and adds nothing else, so it will not pull
a server stack into your app. If you want a ready-made server instead, use
`@pikku/express`.

## Install

```bash
npm install @pikku/express-middleware
```

## Usage

```typescript
import express from 'express'
import { pikkuExpressMiddleware } from '@pikku/express-middleware'

import './.pikku/pikku-bootstrap.gen.js'

const app = express()

app.use(
  pikkuExpressMiddleware({
    logger,
    respondWith404: true,
    loadSchemas: true,
  })
)
```

## Docs

https://pikku.dev/docs
