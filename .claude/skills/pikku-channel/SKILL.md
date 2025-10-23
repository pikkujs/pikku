---
name: pikku-channel
description: Guide for wiring Pikku functions to realtime channels (WebSocket). Use when creating WebSocket connections, implementing pub/sub patterns, handling realtime messages, or building chat/notification systems.
---

# Pikku Channel Wiring Skill

This skill helps you wire Pikku functions to realtime channels using the generated adapter APIs.

## When to use this skill

- Creating WebSocket connections
- Implementing pub/sub patterns
- Handling realtime messages
- Building chat or notification systems
- Setting up channel lifecycle handlers (connect, disconnect, message)
- Implementing action routing for multiplexed channels

## Core Principles

Channel wiring is a **thin binding layer** that:

- Registers channel handlers (connect, disconnect, message, routed actions)
- Keeps domain logic in `packages/functions/src/functions/**/*.function.ts`
- Never imports services directly from wiring

## File Naming Rules

- Channel wiring files must end with `.channel.ts`
- Files can live anywhere under `packages/functions/src/`
- You may group multiple channels per file (same-transport only)

Examples:

```
packages/functions/src/events.channel.ts
packages/functions/src/notifications.channel.ts
```

**Don't mix transports in a single file.**

## Allowed Imports

✅ **Allowed:**

- `wireChannel` from `./pikku-types.gen.ts`
- Exported channel functions from `./functions/**/*.function.ts`:
  - `pikkuChannelConnectionFunc`
  - `pikkuChannelDisconnectionFunc`
  - `pikkuChannelFunc`
- Exported regular functions (`pikkuFunc`, `pikkuSessionlessFunc`) - channel is optional inside them
- Optional `permissions` from `./permissions.ts`
- Optional `middleware` from `./middleware.ts`

❌ **Never:**

- Importing from `./services/**`
- Implementing business logic in wiring
- Using `config` for channel name/route — **hardcode these in wiring**

## Which API Should I Use?

**Channel-specific functions:**

- `pikkuChannelConnectionFunc`
- `pikkuChannelDisconnectionFunc`
- `pikkuChannelFunc`

These are **simple wrappers around `pikkuSessionlessFunc`** with one key difference: **`services.channel` always exists** (not optional).

**When to use each:**

- **Channel required** → Use `pikkuChannelFunc` (and `pikkuChannelConnectionFunc` / `pikkuChannelDisconnectionFunc`) - channel is guaranteed to exist
- **Reuse domain logic** → You may wire a `pikkuFunc` / `pikkuSessionlessFunc` to a channel action; inside those, `services.channel` is **optional** (`services.channel?`)
- **Need WS + HTTP** → Keep core logic in a `pikkuFunc` and call it via `rpc.invoke(...)` from channel handlers

## Channel Data vs. Input

**ChannelData** = data the channel **opened with** (parsed from URL/path/query).
This is NOT the message payload.

Generics:

- `pikkuChannelConnectionFunc<Out, ChannelData>`
- `pikkuChannelDisconnectionFunc<ChannelData>`
- `pikkuChannelFunc<In, Out, ChannelData>`

## services.channel (Runtime Shape)

Available inside channel-aware functions:

```typescript
{
  channelId: string;                     // unique id for this connection
  openingData: OpeningData;              // ChannelData from URL/path/query at open
  send: (data: Out, isBinary?: boolean) => Promise<void> | void; // emit to this connection
  close: () => Promise<void> | void;     // close this connection
  state: 'initial' | 'open' | 'closed';  // lifecycle state
}
```

**Note:** `services.logger` is **not optional**. Use it.

## Automatic Sending of Return Values

If a function is wired as a channel handler, **whatever it returns** is sent back to the client over the channel.
If you don't want to send anything, return `undefined`/`void`.

## Basic Channel Wiring

```typescript
// packages/functions/src/events.channel.ts
import { wireChannel } from './pikku-types.gen.js'
import {
  onConnect,
  onDisconnect,
  onMessage,
} from './functions/events-handlers.function.js'

wireChannel({
  // Unique channel name (typed client bindings depend on this)
  name: 'events',

  // HTTP route that upgrades to this channel (adapter-dependent)
  route: '/',

  // Lifecycle handlers
  onConnect,
  onDisconnect,

  // Message handler
  onMessage,

  // Channel-wide auth default (applies to actions unless overridden)
  auth: true,

  // Optional transport middleware (audit/tracing; keep it light)
  middleware: [audit],

  // Optional tags for deployment filtering
  tags: ['events'],
})
```

## Action Routing with onMessageWiring

`onMessageWiring` enables **message multiplexing** on a single channel.

```typescript
wireChannel({
  name: 'events',
  route: '/',
  onConnect,
  onDisconnect,

  // Fallback message handler if no action wiring matches
  onMessage: defaultHandler,

  // Action routing table
  onMessageWiring: {
    action: {
      subscribe: { func: subscribe },
      unsubscribe, // shorthand reference
    },
  },
})
```

The adapter expects message payloads to include an **`action`** property:

```json
{ "action": "subscribe", "topic": "updates" }
```

→ invokes `subscribe`

```json
{ "action": "unsubscribe", "topic": "updates" }
```

→ invokes `unsubscribe`

**When to use action routing:**

- Reuse one WS connection for multiple behaviors
- Stable client protocol with multiplexing

**Why it's not always recommended:**

- Imposes a `{ action: string, ... }` envelope across clients
- Obscures explicit mapping; typing is indirect without codegen

Use it when you need multiplexing and a stable client protocol; otherwise favor explicit handlers or separate channels.

## Sessions and Authentication

- Use `userSession` in **connect** (or a dedicated auth action) to set identity; rely on it later
- Don't manually check for session presence; rely on `auth`/permissions (on the function or per-action)
- Persistence is adapter-managed; add middleware for auditing/tracing if needed

## Middleware

Attach **transport-specific** middleware (audit/tracing) in wiring.

```typescript
import { pikkuMiddleware } from '#pikku/pikku-types.gen.js'

export const audit = pikkuMiddleware(
  async ({ logger, userSession }, interaction, next) => {
    const start = Date.now()
    try {
      await next()
    } finally {
      const userId = await userSession.get('userId').catch(() => undefined)
      logger.info('channel.audit', {
        route: interaction.route,
        userId,
        ms: Date.now() - start,
      })
    }
  }
)
```

## Permissions

- Prefer attaching `permissions` to the **function** definition
- Add `permissions` in wiring only for transport-specific overrides

## Channel Function Definitions

Channel functions are defined using specialized APIs that are simple wrappers around `pikkuSessionlessFunc`, with `services.channel` always present (not optional).

**Connection Handler:**

```typescript
import { pikkuChannelConnectionFunc } from '#pikku/pikku-types.gen.js'

export const onConnect = pikkuChannelConnectionFunc<
  { welcome: string }, // Out - sent to client on connect
  { room?: string } // ChannelData - from URL/query params
>({
  func: async ({ logger, channel }) => {
    logger.info('Connected', { channelId: channel.channelId })
    return { welcome: 'connected' }
  },
})
```

**Disconnection Handler:**

```typescript
import { pikkuChannelDisconnectionFunc } from '#pikku/pikku-types.gen.js'

export const onDisconnect = pikkuChannelDisconnectionFunc<{ room?: string }>({
  // ChannelData
  func: async ({ logger, channel }) => {
    logger.info('Disconnected', { channelId: channel.channelId })
  },
})
```

**Message Handler:**

```typescript
import { pikkuChannelFunc } from '#pikku/pikku-types.gen.js'

export const onMessage = pikkuChannelFunc<
  { message: string }, // In - message from client
  { received: boolean }, // Out - response to client
  { room?: string } // ChannelData
>({
  func: async ({ logger, channel }, { message }) => {
    logger.info('Message', { message, channelId: channel.channelId })
    return { received: true }
  },
})
```

## Examples

See the `examples/` directory for complete channel wiring examples including:

- Basic channel handlers (connect, disconnect, message)
- Action routing
- Pub/sub patterns
- Authentication

## Review Checklist

- [ ] File ends with `.channel.ts`
- [ ] Adapter imports come **only** from `./pikku-types.gen.ts`
- [ ] Imports limited to exported channel functions and/or regular Pikku functions, plus optional permissions/middleware
- [ ] Channel `name` is unique; `route` is hardcoded (no config indirection)
- [ ] Generics correct: `pikkuChannelConnectionFunc<Out, ChannelData>`, `pikkuChannelDisconnectionFunc<ChannelData>`, `pikkuChannelFunc<In, Out, ChannelData>`
- [ ] `services.channel` used correctly (`channelId`, `openingData`, `send`, `close`, `state`); `logger` is used
- [ ] If using `onMessageWiring`, protocol includes `{ action: string, ... }` and is documented/typed
- [ ] Code style rule respected (await + try/catch; no `.then/.catch`)
- [ ] Functions are defined in `./functions/**/*.function.ts`, not in wiring files
