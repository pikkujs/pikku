# @pikku/fastify-plugin

Fastify plugin for Pikku. Registers your Pikku wirings on a Fastify instance
you already own.

Takes `fastify` as a peer dependency. If you want a ready-made server instead,
use `@pikku/fastify`.

## Install

```bash
npm install @pikku/fastify-plugin
```

## Usage

```typescript
import Fastify from 'fastify'
import pikkuFastifyPlugin from '@pikku/fastify-plugin'

import './.pikku/pikku-bootstrap.gen.js'

const app = Fastify({})

await app.register(pikkuFastifyPlugin, { logger })
```

## Docs

https://pikku.dev/docs
