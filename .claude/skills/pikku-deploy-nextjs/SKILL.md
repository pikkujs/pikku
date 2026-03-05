---
name: pikku-deploy-nextjs
description: 'Use when deploying a Pikku app with Next.js. Covers API route handlers, server-side data fetching, and RPC calls from Server Components.
TRIGGER when: code imports @pikku/next, user mentions Next.js integration, or app/api route files use pikkuAPIRequest.
DO NOT TRIGGER when: just defining functions/wirings without Next.js-specific code.'
---

# Pikku Next.js Deployment

```bash
yarn add @pikku/next
```

## API Route Handler

The CLI generates a typed wrapper. Use it in a catch-all route:

```typescript
// app/api/[...route]/route.ts
import { pikkuAPIRequest } from '@/pikku-nextjs.gen.js'

export const GET = pikkuAPIRequest
export const POST = pikkuAPIRequest
export const PUT = pikkuAPIRequest
export const PATCH = pikkuAPIRequest
export const DELETE = pikkuAPIRequest
```

## Server-Side Data Fetching

Use the generated `pikku()` helper in Server Components or Server Actions:

```typescript
import { pikku } from '@/pikku-nextjs.gen.js'

const { get, post, del, rpc, staticGet, staticPost, staticRPC } = pikku()

// Dynamic (reads headers/cookies — requires request context)
const todos = await get('/todos')
const created = await post('/todos', { title: 'Buy milk' })

// Static (no request context — suitable for precompile/ISR)
const config = await staticGet('/config')

// RPC calls
const result = await rpc('calculateTax', { amount: 100, region: 'US' })
```

**Dynamic vs Static:**
- `get`, `post`, `del`, `rpc` — access headers/cookies, use in dynamic Server Components
- `staticGet`, `staticPost`, `staticRPC` — no request context, safe for precompile/ISR

## How It Works

`PikkuNextJS` lazy-initializes on first request:

```typescript
import { PikkuNextJS } from '@pikku/next'

const pikku = new PikkuNextJS(createConfig, createSingletonServices)
```

**Constructor:** `new PikkuNextJS(createConfig?, createSingletonServices)`

The generated `pikku-nextjs.gen.ts` wraps this with full type safety from your route definitions.
