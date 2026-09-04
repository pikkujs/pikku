---
name: pikku-realtime
description: >-
  Use when making ANY view live/realtime in a Pikku app — a board, shared list, dashboard, ticker, bidding room, live count — or when adding two-way chat/presence. Covers the DEFAULT event-hub SSE path and the two-way WebSocket channel.
  TRIGGER when: the user wants live updates, realtime, "update without refresh", a live board/feed/ticker/room, presence, or chat; or when data that MORE THAN ONE signed-in user can change should reflect others
  DO NOT TRIGGER when: a plain one-shot query/refetch is fine (data only one user changes, or a manual refresh is acceptable), or for background jobs (that is pikku-schedule/pikku-workflow).
installGroups: [core, client]
---

# Pikku Realtime (SSE + WebSocket channels)

There is NOTHING to hand-roll and NOTHING to "find". The event-hub SSE transport
is already wired into every app, and the two patterns below ARE the realtime
templates. Start from them and rename — never grep the project for existing
`sse`/`eventHub` code to copy, never write a custom `EventSource`, and never
write a bespoke `sse: true` route for a plain live feed.

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
await eventHub.publish('lot-updated', null, { topic: 'lot-updated', data: lot })
return lot
```

**A topic is PUBLIC — publish a projection, never `returningAll()`.** The generated
`/events/:topic` route is wired `auth: false` with a sessionless handler, so anyone who can
reach the origin can subscribe to any topic name and read every frame on it. `returningAll()`
then ships the whole row — `reservePrice`, `sellerId`, internal notes, whatever the table
grows next — to unauthenticated subscribers, and it does it silently because the RPC's own
`output` schema never sees the event payload. List the columns the topic is FOR, the way the
example does. If a change genuinely has per-viewer content, it does not belong on a topic:
publish an id-only "something changed" frame and let each client refetch through an
authenticated RPC that applies its own permissions.

The **2nd arg is the channel to EXCLUDE** from the broadcast: pass `null` from a
normal HTTP/RPC write (there is no one to skip); pass `channel.channelId` ONLY
when you publish from INSIDE a channel handler, or the sender gets an echo of its
own update. `eventHub` is already injected — do not wire it.

**Frontend — subscribe over SSE.** The generated
`PikkuRealtime.subscribeToTopic(topic, handler)` opens an SSE stream to the
built-in `/events/:topic` route. Seed state from a normal query, then patch it as
events arrive; the event is the `{ topic, data }` envelope, so read `.data`.

```tsx
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { realtime } from '../lib/pikku'

export function useLiveLots() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const subscription = realtime.subscribeToTopic('lot-updated', () => {
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

`subscribeToTopic` returns `{ close }` — ALWAYS close on unmount or you leak the
stream. Never hand-roll an `EventSource`.

## Level 2 — two-way channel

Only when the client pushes up the socket. The backend channel lives in its own
`*.channel.ts` with `onConnect`/`onMessage` handlers:

```ts
import { pikkuChannelFunc, wireChannel } from '#pikku/channel'

export const onMessage = pikkuChannelFunc<{ text: string }>({
  func: async ({ eventHub }, input, { channel, session }) => {
    const message = { id: crypto.randomUUID(), text: input.text, userId: session!.userId }
    await eventHub.publish('room', channel.channelId, { topic: 'room', data: message })
    return message
  },
})

wireChannel({ name: 'room', route: '/room', auth: true, onMessage })
```

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
`eventHub.publish(topic, channel.channelId, envelope)` — the 2nd arg excludes the
sender, so the browser that sent the message does not receive its own echo.

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
