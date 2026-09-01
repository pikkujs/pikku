# Pikku WebSocket Wiring

## API Reference

### `wireChannel(config)`

```typescript
import { wireChannel } from '#pikku/channel'

wireChannel({
  name: string,                      // Channel name (e.g. 'todos')
  route: string,                     // REQUIRED — the URL path (e.g. '/todos')
  auth?: boolean,                    // Channel-level auth default
  onConnect?: PikkuFunc,             // Called when client connects
  onDisconnect?: PikkuFunc,          // Called when client disconnects
  onMessage?: PikkuFunc,             // Catch-all for unrouted messages
  onMessageWiring?: {                // TWO levels — see below
    [messageField: string]: {
      [fieldValue: string]: {
        func: PikkuFunc,
        auth?: boolean,              // Override channel-level auth
        middleware?: PikkuMiddleware[],
      }
    }
  },
  middleware?: PikkuMiddleware[],
  channelMiddleware?: PikkuChannelMiddleware[],
  binary?: boolean | null,
  onBinaryMessage?: (services, data, channel) => ...,
  tags?: string[],                   // Targets tag middleware
})
```

Note there is **no `permissions` key on a message wiring** — wire-level
permissions were removed in #972. Authorization lives on the function's own
`permissions` field (see `pikku-permissions`).

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
  route: '/todos',
  onMessageWiring: {
    action: {
      // ← the field to route on
      create: { func: createTodo }, // ← its possible values
      list: { func: listTodos, auth: false },
    },
  },
})
```

### Action Routing with Auth

`onMessageWiring` nests two levels because the routing key is configurable. The
**outer** key names the field in the incoming message to dispatch on; the
**inner** keys are the values that field can take. With the conventional outer
key `action`, a client sending `{ action: 'create', data: {...} }` reaches
`createTodo` — but a CLI channel might route on `command` instead, which is why
the field is not hardcoded.

```typescript
const authenticate = pikkuSessionlessFunc({
  title: 'Authenticate',
  // setSession lives on the WIRE (third param), not on services
  func: async (services, { token }, { setSession }) => {
    const session = await verifyJWT(token)
    await setSession(session)
    return { success: true }
  },
})

wireChannel({
  name: 'todos',
  route: '/todos',
  auth: true,
  onMessageWiring: {
    action: {
      authenticate: { func: authenticate, auth: false }, // No session required
      subscribe: { func: subscribeTodos }, // Session required
      create: { func: createTodo },
    },
  },
})
```

### Pub/Sub with EventHub

Use EventHub for real-time broadcasting across connections:

```typescript
wireChannel({
  name: 'todos',
  route: '/todos',
  // eventHub is a service (1st param); channel lives on the wire (3rd)
  onConnect: async ({ eventHub }, _data, { channel }) => {
    eventHub.subscribe('todos:updated', (data) => {
      channel.send(data)
    })
  },
  onMessageWiring: {
    action: {
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
  route: '/todos',
  channelMiddleware: [addTimestamp],
  onMessageWiring: { ... },
})
```

### Generated WebSocket Client

After `npx pikku all`:

```typescript
import { PikkuWebSocket } from '#pikku/pikku-websocket.gen.js'

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
export const authenticate = pikkuSessionlessFunc({
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
  route: '/chat',
  auth: true,
  onConnect: async ({ eventHub }, _data, { channel }) => {
    eventHub.subscribe('chat:message', (data) => {
      channel.send(data)
    })
  },
  onMessageWiring: {
    action: {
      authenticate: { func: authenticate, auth: false },
      send: { func: sendMessage },
      history: { func: listMessages, auth: false },
    },
  },
})
```
