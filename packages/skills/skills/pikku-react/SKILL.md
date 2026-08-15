---
name: pikku-react
description: 'Set up @pikku/react in a React app: PikkuProvider context, createPikku factory, and the usePikkuRPC / usePikkuFetch hooks for direct (non-React-Query) calls. TRIGGER when: the user is bootstrapping a React frontend that talks to a Pikku backend, asks how to wire `PikkuProvider`, or needs to make one-off RPC calls outside of useQuery/useMutation. DO NOT TRIGGER when: the user is asking about useQuery/useMutation hooks (use pikku-react-query) or about workflows (use pikku-workflows-client).'
installGroups: [core]
---

# Pikku React

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

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
  usePikkuAgent,
  usePikkuWorkflow,
  asI18n,
} from '@pikku/react'
```

`usePikkuRealtime` is only valid when you wired a `PikkuRealtime` class via
`createPikku` — see the setup section. `usePikkuAgent` and `usePikkuWorkflow`
are thin bindings over the RPC client that pin one agent/workflow name, so a
component never repeats it. `asI18n` is the i18n brand (see **pikku-i18n**).

## Resolving the server URL

Every client (`createPikku`, realtime, the auth client) resolves its base
through one shared helper in `src/lib/env.ts`. Write this once:

```ts
// Endpoints come from env, never hardcoded.
export function apiUrl(): string {
  // SSR: the client hooks only run in the browser, so a placeholder is fine.
  if (import.meta.env.SSR) {
    return import.meta.env.VITE_API_URL ?? '/__api'
  }
  return import.meta.env.VITE_API_URL ?? `${window.location.origin}/api`
}
```

**Never fall back to `http://localhost:3000`.** `import.meta.env.VITE_API_URL`
is substituted by Vite at _build_ time, so any deploy that supplies the URL as
a _runtime_ env var or platform binding leaves it `undefined` in the shipped
bundle — the fallback is then the only branch that ever runs in the browser. A
localhost fallback means every request from a deployed app goes to the user's
own machine. `origin + '/api'` is same-origin, needs no build-time knowledge of
the domain, and is correct wherever the app is served from.

For local dev, set `VITE_API_URL`, or proxy `/api` → your backend in
`vite.config.ts` under `server.proxy`. One `/api` entry also covers
`/api/auth/*`; only add more entries for root-level routes outside `/api`.

## Setup at the app root

```tsx
import { createPikku, PikkuProvider } from '@pikku/react'
import { PikkuFetch } from './pikku/pikku-fetch.gen'
import { PikkuRPC } from './pikku/pikku-rpc.gen'
import { apiUrl } from './lib/env'

const pikku = createPikku(PikkuFetch, PikkuRPC, {
  serverUrl: apiUrl(),
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
  serverUrl: apiUrl(),
})
// pikku.fetch / pikku.rpc / pikku.realtime — all share the same fetch
// (server URL + auth configured once).
```

The generated classes come from your `pikku.config.json`:

| config field                 | generated file                                        |
| ---------------------------- | ----------------------------------------------------- |
| `clientFiles.fetchFile`      | typed HTTP client (`PikkuFetch` class)                |
| `clientFiles.rpcWiringsFile` | RPC client (`PikkuRPC` class) calling all exposed fns |
| `clientFiles.realtimeFile`   | `PikkuRealtime` (websocket events + SSE + channels)   |

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
    return realtime.subscribe('todo-created', ({ todo }) => {
      /* ... */
    })
  }, [realtime])
  // ...
}
```

The hook throws if no `PikkuRealtime` was wired — that's how you know to
add it to `createPikku(...)`. Full event-hub setup, publishing, and SSE
helpers live in **pikku-realtime**.

## When to reach for what

| Need                                | Use                                                |
| ----------------------------------- | -------------------------------------------------- |
| Render data, dedupe + cache         | **usePikkuQuery** (react-query)                    |
| Trigger a write, wait for result    | **usePikkuMutation** (react-query)                 |
| Paginate                            | **usePikkuInfiniteQuery** (react-query)            |
| One-off call from an event handler  | `usePikkuRPC()` direct                             |
| Hit a REST endpoint (not RPC)       | `usePikkuFetch()`                                  |
| Run one named workflow              | `usePikkuWorkflow('name')` → `.start/.run/.status` |
| Talk to one named AI agent          | `usePikkuAgent('name')` → `.run/.stream/.approve`  |
| Longer-running workflow UX          | **pikku-workflows-client**                         |
| Subscribe to events / SSE / channel | `usePikkuRealtime()` (see **pikku-realtime**)      |

The first three live in your generated `api.gen.ts` (see the
**pikku-react-query** skill). This skill covers the rest.

`usePikkuAgent` and `usePikkuWorkflow` bind the name once and hand back the
call methods with it already applied:

```tsx
const agent = usePikkuAgent('todo-agent')
const { text } = await agent.run({ message, threadId })

const workflow = usePikkuWorkflow('onboardUser')
const { runId } = await workflow.start({ email })
const state = await workflow.status(runId)
```

## Authentication

Auth is handled at the `PikkuFetch` layer, and `createPikku`'s options object
_is_ `CorePikkuFetchOptions` plus `serverUrl` — flat, not nested under a
`fetchOptions` key:

```tsx
const pikku = createPikku(PikkuFetch, PikkuRPC, {
  serverUrl: apiUrl(),
  credentials: 'include', // cookie sessions
  authHeaders: { jwt: token }, // or { apiKey }
  transformDate: true,
})
```

There is no request-interceptor hook. For a token that changes after startup,
call the setter on the shared instance — RPC and realtime pick it up because
they hold the same fetch:

```tsx
pikku.fetch.setAuthorizationJWT(token) // null clears it
pikku.fetch.setAPIKey(key)
pikku.fetch.setHeader('x-tenant', tenantId)
```

`authHeaders.jwt` becomes `Authorization: Bearer …` and `authHeaders.apiKey`
becomes `X-API-KEY`; setting a JWT takes precedence over an API key.

## What NOT to do

- Don't instantiate `PikkuFetch`/`PikkuRPC` inside a component — `createPikku`
  goes once at the app root, the instance flows through Context.
- Don't call `usePikkuRPC()` outside a `<PikkuProvider>` — it throws.
- Don't write a custom RPC client. The generated one already covers every
  exposed function with full types.
- Don't hardcode user-facing strings. Every display string goes through an
  i18n token — see **pikku-i18n** for the setup (it's English-only by default).
