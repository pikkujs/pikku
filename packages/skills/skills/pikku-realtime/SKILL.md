---
name: pikku-realtime
description: >-
  Live views ("update without refresh", boards) and chat or presence: eventHub.publish SSE by default, PikkuRealtime, WebSocket channels. Not when a refetch is enough. Background jobs are pikku-workflow.
installGroups: [core, client]
---

# Pikku Realtime (SSE + WebSocket channels)

For the server half, run this once: `pikku doc eventhub pikkuSubscribeFunc wireChannel pikkuChannelFunc`. The client half is below.

There is NOTHING to hand-roll and NOTHING to "find". A `pikkuSubscribeFunc`
returns the topic a client may follow, `wireHTTP({ sse: true })` exposes it, and
the generated client follows it; the patterns below ARE the realtime templates. Start from them and rename — never grep the
project for existing `sse`/`eventHub` code to copy, never write a custom
`EventSource`, and never write a bespoke `sse: true` route for a plain live feed.

## Pick the transport (almost always SSE)

- **Server → client live updates → SSE via the event-hub.** This is the DEFAULT
  for making any view live: a board, list, dashboard, ticker, feed, or a "room"
  (a bidding room, sale room, live auction). The client only RECEIVES — the
  change itself happens through a NORMAL HTTP RPC (`placeBid`, `updateLot`, …)
  that publishes the new row.
- **Client → server push mid-session → a WebSocket channel.** ONLY when the
  BROWSER must send up the socket without a page action: live chat messages,
  typing indicators, cursors/presence.

A screen being called a "room", or being multi-user, or being live is NOT a
reason to use a channel. If the browser isn't pushing frames up, it's SSE.

## Level 1 — live updates (event-hub SSE, the default)

Two halves; both are required or nothing arrives.

**Backend — publish after every write.** In each create/update/status function,
AFTER the DB write, publish the changed row on a topic:

```ts
const lot = await kysely
  .updateTable('lot')
  .set({ status: 'sold' })
  .where('id', '=', input.lotId)
  .returning(['id', 'status', 'currentBid', 'updatedAt'])
  .executeTakeFirstOrThrow()
await eventHub.publish('lot-updated', lot)
return lot
```

**A topic is only as private as its subscribe function.** The function returns the
topic, so it is where `scopes` and `permissions` go; whoever it admits reads every
frame on that topic. Publish a projection, never `returningAll()`: it would ship
`reservePrice`, `sellerId`, internal notes and whatever the table grows next to
every subscriber, silently, because the RPC's own `output` schema never sees the
event payload. If a change has per-viewer content, publish an id-only "something
changed" frame and let each client refetch through an authenticated RPC.

The 3rd arg is options: `{ except: channel.channelId }` skips the sender, and only
matters when you publish from INSIDE a channel handler. `eventHub` is already
injected, and is publish-only; do not wire it.

**The subscribe function.**

```ts
export const watchLots = pikkuSubscribeFunc<void, `lot-updated:${string}`>({
  scopes: ['lots:read'],
  func: async () => 'lot-updated:all',
})
// wiring: wireHTTP({ route: '/lots/events', method: 'get', sse: true, func: watchLots })
```

**Frontend — subscribe over SSE.** The generated
`PikkuRealtime.subscribeToSSE(path, handler)` opens the SSE stream of the route
above. Seed state from a normal query, then refresh it as events arrive.

```tsx
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { realtime } from '../lib/pikku'

export function useLiveLots() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const subscription = realtime.subscribeToSSE('/lots/events', () => {
      queryClient.invalidateQueries({ queryKey: ['listLots'] })
    })
    return () => subscription.close()
  }, [queryClient])
}
```

**Invalidate; do not hand-patch the cache.** The generated hooks key a query as
`[name, input]` — `['listLots', { status: 'open', cursor: undefined }]`, one entry per set of
arguments — so `setQueryData(['listLots'], …)` writes to a key nothing reads and the screen
never changes. `invalidateQueries({ queryKey: ['listLots'] })` prefix-matches, so it refreshes
every variant of that list whatever input each one was fetched with.

Patching also has to know the payload's shape, and a list RPC returns
`ListOutput<Lot>` — `{ rows, nextCursor, totalCount? }`, not `Lot[]` — so a `rows.map(...)`
updater is reading `.map` off an object. Refetching sidesteps both, and it re-applies the server's own filtering,
which a locally patched row does not: a lot that just moved to `sold` may no longer belong in
an "open lots" list at all.

`subscribeToSSE` returns `{ close }` — ALWAYS close on unmount or you leak the
stream. Never hand-roll an `EventSource`.

## Level 2 — two-way channel

Only when the client pushes up the socket. The backend channel lives in its own
`*.channel.ts`: `pikkuChannelFunc` handlers on `wireChannel`, with `auth: true`. `auth: true` only proves someone is signed in: a handler for a private room checks the sender's membership of that room on every message, and private payloads stay off public event-hub topics.

The frontend opens it with `PikkuRealtime.connectToChannel(path)`, which returns
a socket you both `.send(...)` on and read via `onmessage`:

```tsx
useEffect(() => {
  const socket = realtime.connectToChannel('/room')
  socket.onmessage = (event) => appendMessage(JSON.parse(event.data))
  return () => socket.close()
}, [])
```

Publish server→client fan-out from a channel handler with
`eventHub.publish(topic, data, { except: channel.channelId })` — `except` skips
the sender, so the browser that sent the message does not receive its own echo.
A channel subscribes through a `pikkuSubscribeFunc` wired as a message action.

## Do NOT

- Do **not** grep the project for existing SSE/eventHub infra to reverse-engineer
  or copy — the patterns above ARE the template (same rule as never reading
  `.gen.ts` to learn an API).
- Do **not** write a custom `sse: true` HTTP route or a bespoke `EventSource` for
  an ordinary live feed — the event-hub covers it. (A dedicated `sse: true` route
  is only for a long-job PROGRESS stream, and is not needed for an initial build.)
- Do **not** use a WebSocket channel for a live board/ticker/room — that is SSE.
  A channel is for client→server push (chat/presence) ONLY.
- Do **not** forget the backend `eventHub.publish(...)` — a subscribed frontend
  with no publisher is a silent, empty stream.
