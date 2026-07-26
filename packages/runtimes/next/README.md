# @pikku/next

Next.js runtime for Pikku — call your Pikku functions from server components,
server actions and route handlers, with Better Auth integration.

## Install

```bash
npm install @pikku/next
```

## Usage

```typescript
import { PikkuNextJS } from '@pikku/next'

import './.pikku/pikku-bootstrap.gen.js'

const pikku = new PikkuNextJS(createConfig, createSingletonServices)

// In a server action
const todos = await pikku.actionRequest('/todos', 'GET', {})

// In a route handler
export const GET = (req: Request) => pikku.apiRequest(req)
```

`staticActionRequest` is the equivalent for statically rendered pages.

## Docs

https://pikku.dev/docs
