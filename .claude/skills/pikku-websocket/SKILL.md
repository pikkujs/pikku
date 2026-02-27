---
name: pikku-websocket
description: 'Use when adding real-time features, WebSocket channels, live updates, chat, or pub/sub to a Pikku app. Covers wireChannel, action routing, auth, EventHub pub/sub, channel middleware, and generated WebSocket client.'
---

# Pikku WebSocket Wiring

Wire Pikku functions to WebSocket channels with structured message routing, auth per-action, pub/sub via EventHub, and auto-generated type-safe clients.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions and their types
pikku info tags --verbose        # Understand project organization
```

Follow existing patterns. See `pikku-concepts` for the core mental model.

## API Reference

### `wireChannel(config)`

```typescript
import { wireChannel } from '@pikku/core/channel'

wireChannel({
  name: string,                      // Channel name (e.g. 'todos')
  onConnect: async () => {},         // Called when client connects
  onDisconnect: async () => {},      // Called when client disconnects
  onMessageWiring: {                 // Action → function mapping
    [actionName: string]: {
      func: PikkuFunc,
      auth?: boolean,                // Override channel-level auth
      permissions?: Record<string, PikkuPermission | PikkuPermission[]>,
    }
  },
  channelMiddleware?: PikkuChannelMiddleware[],
})
```

### `pikkuChannelMiddleware(fn)`

```typescript
import { pikkuChannelMiddleware } from '@pikku/core'

const middleware = pikkuChannelMiddleware(async (services, event, next) => {
  // Transform or filter events before/after
  await next(event) // Pass modified event, or next(null) to drop
})
```

### `addChannelMiddleware(domain, middlewares)`

```typescript
addChannelMiddleware('todos', [addTimestamp, filterSensitive])
```

## Usage Patterns

### Basic Channel

```typescript
wireChannel({
  name: 'todos',
  onConnect: async () => {},
  onDisconnect: async () => {},
  onMessageWiring: {
    create: { func: createTodo },
    list: { func: listTodos, auth: false },
  },
})
```

### Action Routing with Auth

Clients send `{ action: 'create', data: {...} }`. Pikku routes to the matching function.

```typescript
const authenticate = pikkuFunc({
  title: 'Authenticate',
  func: async ({ setSession }, { token }) => {
    const session = await verifyJWT(token)
    setSession(session)
    return { success: true }
  },
})

wireChannel({
  name: 'todos',
  onConnect: async () => {},
  onDisconnect: async () => {},
  onMessageWiring: {
    auth: { func: authenticate, auth: false }, // No session required
    subscribe: { func: subscribeTodos }, // Session required
    create: { func: createTodo },
  },
})
```

### Pub/Sub with EventHub

Use EventHub for real-time broadcasting across connections:

```typescript
wireChannel({
  name: 'todos',
  onConnect: async ({ eventHub, channel }) => {
    eventHub.subscribe('todos:updated', (data) => {
      channel.send(data)
    })
  },
  onDisconnect: async () => {},
  onMessageWiring: {
    create: {
      func: pikkuFunc({
        title: 'Create Todo',
        func: async ({ db, eventHub }, { text }) => {
          const todo = await db.createTodo({ text })
          eventHub.publish('todos:updated', {
            event: 'created',
            todo,
          })
          return { todo }
        },
      }),
    },
  },
})
```

### Channel Middleware

```typescript
const addTimestamp = pikkuChannelMiddleware(
  async ({ logger }, event, next) => {
    logger.info({ phase: 'before-send', event })
    await next({ ...event, sentAt: Date.now() })
  }
)

const filterSensitive = pikkuChannelMiddleware(
  async (_services, event, next) => {
    if (event.internal) return await next(null)  // Drop event
    await next(event)
  }
)

// Apply globally to a domain
addChannelMiddleware('todos', [addTimestamp, filterSensitive])

// Or inline on wiring
wireChannel({
  name: 'todos',
  channelMiddleware: [addTimestamp],
  onConnect: async () => {},
  onDisconnect: async () => {},
  onMessageWiring: { ... },
})
```

### Generated WebSocket Client

After `npx pikku prebuild`:

```typescript
import { PikkuWebSocket } from '.pikku/pikku-websocket.gen.js'

const pikku = new PikkuWebSocket(ws)
const todosRoute = pikku.getRoute('todos')

// Send action (type-safe)
const result = await todosRoute.send('create', { text: 'Buy milk' })

// Subscribe to events
todosRoute.subscribe('todos:updated', (data) => {
  console.log(data.event, data.todo)
})
```

## Complete Example

```typescript
// functions/chat.functions.ts
export const authenticate = pikkuFunc({
  title: 'Authenticate',
  func: async ({ jwt }, { token }, { setSession }) => {
    const payload = await jwt.verify(token)
    setSession({ userId: payload.userId })
    return { success: true }
  },
})

export const sendMessage = pikkuFunc({
  title: 'Send Message',
  func: async ({ db, eventHub }, { text }, { session }) => {
    const message = await db.createMessage({
      text,
      userId: session.userId,
    })
    eventHub.publish('chat:message', { message })
    return { message }
  },
})

export const listMessages = pikkuSessionlessFunc({
  title: 'List Messages',
  func: async ({ db }, { limit }) => {
    return { messages: await db.listMessages(limit) }
  },
})

// wirings/chat.channel.ts
wireChannel({
  name: 'chat',
  onConnect: async ({ eventHub, channel }) => {
    eventHub.subscribe('chat:message', (data) => {
      channel.send(data)
    })
  },
  onDisconnect: async () => {},
  onMessageWiring: {
    auth: { func: authenticate, auth: false },
    send: { func: sendMessage },
    history: { func: listMessages, auth: false },
  },
})
```
