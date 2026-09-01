# Next.js

```bash
yarn add @pikku/next
```

## API route handler

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

`pikkuAPIRequest` strips a leading `/api` from the pathname before routing, so
wirings are declared as `/todos`, not `/api/todos`, even though the route file
lives under `app/api`. Turn that off with `removeAPIPrefix(false)` from the same
generated file if your wirings really do carry the prefix.

It takes `(req, context)` to match Next's handler signature but ignores the
context — Pikku routes from the URL, so the catch-all segment name is yours to
choose. It also passes no `RunHTTPWiringOptions`: to set `maxBodySize` or
`respondWith404` you need your own handler over `new PikkuNextJS(...)` calling
`apiRequest(req, options)`.

## Server-side data fetching

Use the generated `pikku()` helper in Server Components or Server Actions:

```typescript
import { pikku } from '@/pikku-nextjs.gen.js'

const { get, post, patch, del, rpc, staticGet, staticPost, staticRPC } = pikku()

// Dynamic (reads headers/cookies — requires request context)
const todos = await get('/todos')
const created = await post('/todos', { title: 'Buy milk' })

// Static (no request context — suitable for precompile/ISR)
const config = await staticGet('/config')

// RPC calls
const result = await rpc('calculateTax', { amount: 100, region: 'US' })
```

`get`, `post`, `patch`, `del` and `rpc` read `next/headers` cookies and headers,
so they force the component dynamic. `staticGet`, `staticPost` and `staticRPC`
have no request context and are safe for precompile/ISR.

The static variants pass `skipUserSession: true`, so a wiring that expects a
session sees none. That is the real difference — not just where they can run.
There is no `staticPatch` or `staticDel`; a mutation at build time is not a
thing the generated client offers.

Both paths run with `bubbleErrors: true`, so a failing wiring **throws** in your
Server Component rather than resolving to an error status. Wrap the call, or let
the Next.js error boundary take it.

## How it works

`PikkuNextJS` lazy-initializes on first request:

```typescript
import { PikkuNextJS } from '@pikku/next'

const pikku = new PikkuNextJS(createConfig, createSingletonServices)
```

Both arguments are positional and `createConfig` is only optional in the sense
that passing `undefined` substitutes an empty config —
`createSingletonServices` is required.

Initialization is memoized on a promise, so concurrent first requests share one
setup; a failed setup clears the promise, so the next request retries rather
than caching the failure forever.

The generated `pikku-nextjs.gen.ts` wraps this with full type safety from your
route definitions.

## Related exports

- **`PikkuNextJSWorkerRPC({ fetcher })`** — same surface as `PikkuNextJS`, but
  every call is dispatched through a `Fetcher` (a Cloudflare service binding, a
  local HTTP client, a fabric dispatcher) instead of loading function code
  in-process. Use it to keep functions out of the SSR bundle. A non-2xx response
  throws with the status and body text.
- **`toNextJsAuthHandler(auth)`** — wraps a better-auth instance or handler
  function for an auth route. The three-argument form
  `(pikkuAuthFactory, createConfig, createSingletonServices)` resolves a Pikku
  better-auth factory lazily; it throws if you pass `createConfig` without
  `createSingletonServices`. `nextCookies` is re-exported alongside it.
