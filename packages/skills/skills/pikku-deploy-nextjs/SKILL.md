---
name: pikku-deploy-nextjs
description: >-
  Use when deploying a Pikku app with Next.js. Covers API route handlers, server-side data
  fetching, and RPC calls from Server Components. TRIGGER when: code imports @pikku/next, user
  mentions Next.js integration, or app/api route files use pikkuAPIRequest. DO NOT TRIGGER when:
  just defining functions/wirings without Next.js-specific code.
---

# Pikku Next.js Deployment

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

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
