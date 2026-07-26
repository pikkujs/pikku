# @pikku/tanstack-start

TanStack Start runtime for Pikku, including a Better Auth handler adapter.

## Install

```bash
npm install @pikku/tanstack-start
```

## Usage

```typescript
import { toTanStackStartAuthHandler } from '@pikku/tanstack-start'

import './.pikku/pikku-bootstrap.gen.js'

export const ServerRoute = toTanStackStartAuthHandler(auth)
```

## Docs

https://pikku.dev/docs
