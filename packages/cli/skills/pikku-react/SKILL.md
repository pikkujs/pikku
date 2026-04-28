---
name: pikku-react
description: 'Set up @pikku/react in a React app: PikkuProvider context, createPikku factory, and the usePikkuRPC / usePikkuFetch hooks for direct (non-React-Query) calls. TRIGGER when: the user is bootstrapping a React frontend that talks to a Pikku backend, asks how to wire `PikkuProvider`, or needs to make one-off RPC calls outside of useQuery/useMutation. DO NOT TRIGGER when: the user is asking about useQuery/useMutation hooks (use pikku-react-query) or about workflows (use pikku-workflows-client).'
---

# Pikku React

`@pikku/react` is the smallest possible binding: a Context provider plus
two hooks. It does **not** depend on React Query — that's a separate
opt-in via the generated `api.gen.ts`. Use this skill when setting up the
provider or making direct RPC calls.

## What ships

```tsx
import {
  PikkuProvider,
  createPikku,
  usePikkuFetch,
  usePikkuRPC,
  usePikkuRealtime,
} from '@pikku/react'
```

Five exports. `usePikkuRealtime` is only valid when you wired a
`PikkuRealtime` class via `createPikku` — see step 3 below.

## Setup at the app root

```tsx
import { createPikku, PikkuProvider } from '@pikku/react'
import { PikkuFetch } from './pikku/pikku-fetch.gen'
import { PikkuRPC } from './pikku/pikku-rpc.gen'

const pikku = createPikku(PikkuFetch, PikkuRPC, {
  serverUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
})

createRoot(document.getElementById('root')!).render(
  <PikkuProvider pikku={pikku}>
    <App />
  </PikkuProvider>
)
```

If the project also exposes realtime events (see **pikku-realtime**), pass
the `PikkuRealtime` class as the third argument and the instance gets a
`realtime` field too:

```tsx
import { PikkuRealtime } from './pikku/realtime.gen'

const pikku = createPikku(PikkuFetch, PikkuRPC, PikkuRealtime, {
  serverUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
})
// pikku.fetch / pikku.rpc / pikku.realtime — all share the same fetch
// (server URL + auth configured once).
```

The generated classes come from your `pikku.config.json`:

| config field                       | generated file                                         |
|------------------------------------|--------------------------------------------------------|
| `clientFiles.fetchFile`            | typed HTTP client (`PikkuFetch` class)                 |
| `clientFiles.rpcWiringsFile`       | RPC client (`PikkuRPC` class) calling all exposed fns  |
| `clientFiles.realtimeFile`         | `PikkuRealtime` (websocket events + SSE + channels)    |

If a file isn't being generated, that field is missing from the config —
add it and re-run `pikku all`.

`createPikku(...)` accepts the same `CorePikkuFetchOptions` as `PikkuFetch`
plus `serverUrl`. Auth headers, request interceptors, etc. are configured
on the fetch instance — RPC and realtime inherit them automatically.

## Calling an RPC directly (no React Query)

Inside a component:

```tsx
import { usePikkuRPC } from '@pikku/react'

function Logout() {
  const rpc = usePikkuRPC()
  return <button onClick={() => rpc.invoke('logoutUser', {})}>Sign out</button>
}
```

`rpc.invoke(name, data)` is typed against `FlattenedRPCMap` — `name` must
be an exposed function id, `data` matches the input schema, return value
matches the output schema.

You also have `rpc.<funcName>(data)` if the generated RPC client builds
direct methods (project-dependent).

## Calling fetch directly

```tsx
const fetch = usePikkuFetch()
const data = await fetch.get('/some-rest-route', { searchParams: {...} })
```

Use this only when the function is wired via HTTP (REST shape) and you
need a path-style call. For RPC calls, `usePikkuRPC()` is cleaner.

## Realtime subscriptions

If you wired a `PikkuRealtime` class into `createPikku`, use
`usePikkuRealtime()` to grab the shared instance:

```tsx
import { usePikkuRealtime } from '@pikku/react'
import type { PikkuRealtime } from './pikku/realtime.gen'

function TodoList() {
  const realtime = usePikkuRealtime<PikkuRealtime>()
  useEffect(() => {
    return realtime.subscribe('todo-created', ({ todo }) => { /* ... */ })
  }, [realtime])
  // ...
}
```

The hook throws if no `PikkuRealtime` was wired — that's how you know to
add it to `createPikku(...)`. Full event-hub setup, publishing, and SSE
helpers live in **pikku-realtime**.

## When to reach for what

| Need                                          | Use                       |
|-----------------------------------------------|---------------------------|
| Render data, dedupe + cache                   | **usePikkuQuery** (react-query) |
| Trigger a write, wait for result              | **usePikkuMutation** (react-query) |
| Paginate                                      | **usePikkuInfiniteQuery** (react-query) |
| One-off call from an event handler            | `usePikkuRPC()` direct |
| Hit a REST endpoint (not RPC)                 | `usePikkuFetch()` |
| Run a workflow                                | **pikku-workflows-client** |
| Subscribe to events / SSE / channel           | `usePikkuRealtime()` (see **pikku-realtime**) |

The first three live in your generated `api.gen.ts` (see the
**pikku-react-query** skill). This skill covers the bottom four rows.

## Authentication

Auth is handled at the `PikkuFetch` layer — pass options to `createPikku`
or set headers on the fetch instance after creation. Common pattern:

```tsx
const pikku = createPikku(PikkuFetch, PikkuRPC, {
  serverUrl: '...',
  fetchOptions: {
    onRequest: (req) => {
      const token = localStorage.getItem('token')
      if (token) req.headers.set('Authorization', `Bearer ${token}`)
    },
  },
})
```

Exact option names depend on the `@pikku/fetch` version — read
`PikkuFetch`'s constructor type if unsure.

## What NOT to do

- Don't instantiate `PikkuFetch`/`PikkuRPC` inside a component — `createPikku`
  goes once at the app root, the instance flows through Context.
- Don't call `usePikkuRPC()` outside a `<PikkuProvider>` — it throws.
- Don't write a custom RPC client. The generated one already covers every
  exposed function with full types.
