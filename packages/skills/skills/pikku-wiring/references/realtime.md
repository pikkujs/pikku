# Pikku Realtime

## Contents

- 1. The model: the function decides the topic
- 2. Write a subscribe function
- 3. Expose it (SSE route or channel action)
- 4. Publish events from a function
- 5. Generate the typed client
- 6. Subscribe from React
- When to pick which transport
- What NOT to do

## 1. The model: the function decides the topic

A client never names a topic. It calls a **subscribe function**, and the
function's body returns the topic the client is allowed to follow. The function
runs the normal path first (session, `scopes`, `permissions`, fail closed); if
it throws, nothing is subscribed (SSE answers an honest 401/403, a channel sends
an error frame). There is no open `/events/:topic` route and no unsubscribe: a
channel leaves its topics on disconnect.

`services.eventHub` is publish-only. Subscribing, relays and delivery belong to
the runtime, which creates the hub before `createSingletonServices`; apps never
construct one.

## 2. Write a subscribe function

```ts
import { pikkuSubscribeFunc } from '#pikku/function'

export const watchOrder = pikkuSubscribeFunc<
  { orderId: string },
  `order:${string}`
>({
  scopes: ['orders:read'],
  permissions: { owner: isOrderOwner },
  func: async (_services, { orderId }) => `order:${orderId}`,
})
```

The second generic is the topic's shape. `pikku all` collects every shape into
the generated `EventHubTopic` union; publishers are checked against it at runtime
and a publish to a topic no subscribe function can return is refused. A public
topic is wired with `auth: false` like any public route.

## 3. Expose it

As an SSE route (server to client only):

```ts
wireHTTP({ route: '/orders/:orderId/events', method: 'get', sse: true, func: watchOrder })
```

Or as a channel action (the browser also sends frames):

```ts
wireChannel({
  name: 'orders',
  route: '/orders',
  auth: true,
  onMessageWiring: { action: { watch: watchOrder } },
})
```

## 4. Publish events from a function

```ts
await eventHub.publish('order:7', { status: 'shipped' }, { except: channel?.channelId })
```

`publish(topic, data, options?)`. `except` is a channel id to skip (the
originating connection, if it already applied the change); `isBinary` sends the
payload as it is. Publish a projection, never `returningAll()`: whoever the
subscribe function admits reads every frame on the topic.

## 5. Generate the typed client

`pikku all` writes the client to `.pikku/sdk/<backend>/exposed/pikku-realtime.gen.ts`;
import it through the `@sdk/<backend>` alias.

```ts
export class PikkuRealtime {
  setPikkuFetch(fetch: PikkuFetch): void // server URL + auth come from here
  setServerUrl(url: string): void
  setAuthorizationJWT(jwt: string | null): void
  setAPIKey(apiKey: string | null): void

  // Any `sse: true` route, such as a subscribe function's route
  subscribeToSSE<T>(
    path: string,
    handler: (data: T) => void,
    onError?: (err: unknown) => void
  ): { close: () => void }
  // Any wireChannel: a raw socket, wrapped in PikkuWebSocket for typed I/O
  connectToChannel(channelRoute: string, protocols?: string | string[]): WebSocket

  close(): void
}
```

## 6. Subscribe from React

Subscribe inside `useEffect` (never the render path) and close on unmount:

```tsx
useEffect(() => {
  const stream = realtime.subscribeToSSE<{ status: string }>(
    `/orders/${orderId}/events`,
    () => queryClient.invalidateQueries({ queryKey: ['getOrder'] })
  )
  return () => stream.close()
}, [realtime, orderId])
```

## When to pick which transport

| Need                                       | Use                              |
| ------------------------------------------ | -------------------------------- |
| Server to client live updates              | SSE route on a subscribe function |
| Bidirectional (client also sends messages) | `wireChannel` with a subscribe action |
| WebSockets blocked by infra                | SSE route                        |

Both clean up on the server: the hub drops a closed channel's subscriptions.

## What NOT to do

- Don't hand-write a topic route that reads the topic from the client; the
  subscribe function's return value is the topic.
- Don't call `eventHub.subscribe`: it does not exist on the service.
- Don't subscribe inside the render path; use `useEffect`.
- Don't publish a whole row; publish the columns the topic is for.
