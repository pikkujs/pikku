---
name: pikku-realtime
description: 'Use Pikku''s realtime feature — typed pub/sub events over WebSocket (multi-topic) or SSE (single-topic, auto-cleanup). Covers declaring EventHubTopics, scaffolding the /events channel, the auto-generated `PikkuRealtime` client, and publishing events from a function. TRIGGER when: the user asks for realtime updates, pub/sub, push notifications, server-sent events, websocket events, eventhub, or "live" data on the frontend. DO NOT TRIGGER when: the user wants RPC-style request/response (use pikku-rpc / pikku-react-query) or a custom one-off WebSocket channel (use pikku-websocket).'
installGroups: [core]
---

# Pikku Realtime

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Most realtime UI is just typed pub/sub: a server pushes `todo-created`, the client
renders it. Pikku ships exactly that, two ways — both use the same `EventHubService`
and the same publish call, so choose by transport, not by code shape:

- **WebSocket** at `/events` — one connection, many topic subscriptions.
- **SSE** at `GET /events/:topic` — one connection per topic, auto-cleanup on
  disconnect. Good when WebSocket is blocked or for trivially streaming one topic.

## 1. Declare your topics

In your project's types file (e.g. `types/eventhub-topics.d.ts`):

```ts
import type { Todo } from '../src/schemas.js'

export type EventHubTopics = {
  'todo-created': { todo: Todo }
  'todo-updated': { todo: Todo }
  'todo-deleted': { todoId: string }
}
```

Reference it in `application-types.d.ts` and instantiate it in `services.ts`:

```ts
// application-types.d.ts
import type { EventHubService } from '@pikku/core/channel'
import type { EventHubTopics } from './eventhub-topics.js'

export interface SingletonServices extends CoreSingletonServices<Config> {
  eventHub?: EventHubService<EventHubTopics>
}

// services.ts
import { LocalEventHubService } from '@pikku/core/channel'
const eventHub = new LocalEventHubService<EventHubTopics>()
```

For multi-instance deployments use `CloudflareEventHubService` /
`LambdaEventHubService` / `UWSEventHubService` instead — same interface.

## 2. Enable the server side

```bash
yarn pikku enable events           # auth required by default
yarn pikku enable events --noAuth  # public events
```

This sets `scaffold.events` in `pikku.config.json`. The next `pikku all` generates
`events.gen.ts` in your scaffold dir, wiring (using whatever `eventHub` is in your
singletons — you write neither by hand):

- A WebSocket channel at `/events` handling `{action: 'subscribe' | 'unsubscribe', topic}` messages.
- An SSE handler at `GET /events/:topic`.

## 3. Generate the typed client

Add to `pikku.config.json`:

```jsonc
{
  "clientFiles": {
    "realtimeFile": "packages/sdk/src/pikku/realtime.gen.ts",
    // Optional: full type inference for subscribe/unsubscribe
    "realtimeEventHubTopicsImport": "../../../functions/types/eventhub-topics.js#EventHubTopics",
  },
}
```

Run `pikku all` (or `pikku realtime` to regenerate just this file). The generated
file exports two surfaces:

```ts
export class PikkuRealtime {
  constructor(options: { url: string; reconnect?: boolean; ... })
  subscribe<K extends keyof EventHubTopics>(topic: K, handler: (data: EventHubTopics[K]) => void): () => void
  unsubscribe<K extends keyof EventHubTopics>(topic: K, handler?: ...): void
  close(): void
}

export function subscribeToTopicViaSSE<K extends keyof EventHubTopics>(
  baseUrl: string, topic: K, handler: (data: EventHubTopics[K]) => void
): { close: () => void }
```

Without `realtimeEventHubTopicsImport`, the client falls back to
`Record<string, unknown>` — usable but untyped. Set the import for full typed
subscribe/unsubscribe.

## 4. Publish events from a function

The `/events` channel listens for client subscriptions; the eventHub fans out
publishes. Envelope the payload with `topic` so the client dispatcher works; the
`null` channelId means "broadcast to all subscribers" (pass a specific channel id
to exclude/include a single connection):

```ts
import { pikkuFunc } from '#pikku'

export const createTodo = pikkuFunc({
  input: CreateTodoInput,
  output: CreateTodoOutput,
  func: async ({ kysely, eventHub }, data) => {
    const todo = await kysely
      .insertInto('todos').values(data).returningAll()
      .executeTakeFirstOrThrow()

    if (eventHub) {
      await eventHub.publish('todo-created', null, {
        topic: 'todo-created',
        data: { todo },
      })
    }
    return { id: todo.id }
  },
})
```

A thin helper removes the duplication:

```ts
async function publishEvent<K extends keyof EventHubTopics>(
  hub: EventHubService<EventHubTopics>, topic: K, data: EventHubTopics[K]
) {
  return hub.publish(topic, null, { topic, data })
}
// usage: await publishEvent(eventHub, 'todo-created', { todo })
```

## 5. Wire it up — share fetch with PikkuRPC

`PikkuRealtime` mirrors `PikkuRPC`: it wraps the same `PikkuFetch`, so server URL +
auth are configured **once** and shared across HTTP, RPC, and realtime transports.

```tsx
import { createPikku, PikkuProvider } from '@pikku/react'
import { PikkuFetch } from './pikku/pikku-fetch.gen'
import { PikkuRPC } from './pikku/pikku-rpc.gen'
import { PikkuRealtime } from './pikku/realtime.gen'

const pikku = createPikku(
  PikkuFetch,
  PikkuRPC,
  PikkuRealtime, // pass the realtime class as the third arg
  { serverUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000' }
)
// pikku.fetch / pikku.rpc / pikku.realtime — all share the same fetch.

createRoot(document.getElementById('root')!).render(
  <PikkuProvider pikku={pikku}><App /></PikkuProvider>
)
```

Or wire manually:

```ts
const realtime = new PikkuRealtime()
realtime.setPikkuFetch(pikku.fetch) // inherits serverUrl + auth
```

## 6. Subscribe from React

Subscribe inside `useEffect` (never the render path, or you create a subscription
per render). `subscribe` returns an unsubscribe function; SSE's `subscribeToTopic`
returns a handle with `close()`:

```tsx
import { useEffect, useState } from 'react'

function TodoList() {
  const { realtime } = usePikku() // a hook over your context
  const [todos, setTodos] = useState<Todo[]>([])

  useEffect(() => {
    // WebSocket multi-topic:
    const off = realtime.subscribe('todo-created', ({ todo }) =>
      setTodos((prev) => [...prev, todo]))
    return off

    // Single-topic SSE (auto-cleanup on close) instead:
    // const sub = realtime.subscribeToTopic('todo-created', ({ todo }) =>
    //   setTodos((prev) => [...prev, todo]))
    // return () => sub.close()
  }, [realtime])

  return <ul>{todos.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
}
```

## Other SSE / WebSocket routes

The same client also subscribes to generic `sse: true` routes and raw `wireChannel`
sockets (`subscribeToSSE`, `connectToChannel`). See
[references/other-routes.md](references/other-routes.md).

## When to pick which transport

| Need                                       | Use                           |
| ------------------------------------------ | ----------------------------- |
| Many topics in one connection              | **PikkuRealtime** (WebSocket) |
| Single live stream, simple cleanup         | **subscribeToTopicViaSSE**    |
| Bidirectional (client also sends messages) | **PikkuRealtime**             |
| WebSockets blocked by infra                | **subscribeToTopicViaSSE**    |

Both auto-clean on the server (the eventHub's `onChannelClosed` hook unsubscribes
all topics for the dead channel id). Don't write manual cleanup unless you're
unsubscribing partway through a session.

## What NOT to do

- Don't call `eventHub.publish(topic, ..., rawData)` without the `{topic, data}`
  envelope — clients use `topic` to dispatch handlers.
- Don't create your own `/events` channel by hand — `pikku enable events` already
  does it correctly with disconnect cleanup.
- Don't subscribe inside the render path — use `useEffect`.
- Don't subscribe to topics that don't exist in `EventHubTopics`. The generated
  client's types prevent it; if you reach for `as any` to subscribe to a string,
  declare the topic first.
