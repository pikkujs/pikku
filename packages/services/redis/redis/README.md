# @pikku/redis

Redis-based implementations of Pikku's ChannelStore and EventHubStore.

## Features

- **RedisChannelStore**: Redis implementation of ChannelStore for persistent channel state
- **RedisEventHubStore**: Redis implementation of EventHubStore for pub/sub topic subscriptions
- **Fast in-memory storage**: Leverage Redis for high-performance channel management
- **Configurable key prefix**: Use custom key prefixes for namespace isolation (default: 'pikku')
- **Type-safe**: Full TypeScript support with generics

## Installation

```bash
npm install @pikku/redis ioredis
# or
yarn add @pikku/redis ioredis
```

## Usage

### Basic Setup

```typescript
import Redis from 'ioredis'
import { RedisChannelStore, RedisEventHubStore } from '@pikku/redis'

// Create Redis connection
const redis = new Redis({
  host: 'localhost',
  port: 6379,
})

// Create stores with default key prefix ('pikku')
const channelStore = new RedisChannelStore(redis)
const eventHubStore = new RedisEventHubStore(redis)

// Initialize (verifies connection)
await channelStore.init()
await eventHubStore.init()
```

### Custom Key Prefix

```typescript
// Use a custom key prefix for namespace isolation
const channelStore = new RedisChannelStore(redis, 'myapp')
const eventHubStore = new RedisEventHubStore(redis, 'myapp')

await channelStore.init()
await eventHubStore.init()
```

### With Connection String

```typescript
// Create stores with Redis connection string
const channelStore = new RedisChannelStore('redis://localhost:6379')
const eventHubStore = new RedisEventHubStore('redis://localhost:6379')

await channelStore.init()
await eventHubStore.init()
```

### With Pikku Server

```typescript
import { createExpressServer } from '@pikku/express'
import { RedisChannelStore, RedisEventHubStore } from '@pikku/redis'
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL!)

const channelStore = new RedisChannelStore(redis)
const eventHubStore = new RedisEventHubStore(redis)

await channelStore.init()
await eventHubStore.init()

const server = createExpressServer({
  channelStore,
  eventHubStore,
  // ... other options
})
```

## Redis Data Structure

The stores use the following Redis data structures:

### ChannelStore
- **Hash**: `{keyPrefix}:channel:{channelId}` - Stores channel data
  - `channelId`: Channel ID
  - `channelName`: Channel name
  - `openingData`: JSON string of opening data
  - `userSession`: JSON string of user session
  - `createdAt`: Timestamp

### EventHubStore
- **Set**: `{keyPrefix}:topic:{topicName}` - Set of channelIds subscribed to topic
- **Set**: `{keyPrefix}:subs:{channelId}` - Set of topics the channel is subscribed to

## API

### RedisChannelStore

Extends `ChannelStore` from `@pikku/core/channel`.

#### Constructor

```typescript
new RedisChannelStore(
  connectionOrConfig: Redis | RedisOptions | string,
  keyPrefix?: string
)
```

- `connectionOrConfig`: ioredis Redis instance, RedisOptions config, or connection string
- `keyPrefix`: Redis key prefix (default: 'pikku')

#### Methods

- `init()`: Initialize the store (verifies Redis connection)
- `addChannel(channel)`: Add a new channel
- `removeChannels(channelIds)`: Remove channels by IDs
- `setUserSession(channelId, session)`: Set user session for a channel
- `getChannelAndSession(channelId)`: Get channel data with session
- `close()`: Close Redis connection (if owned)

### RedisEventHubStore

Implements `EventHubStore` from `@pikku/core/channel`.

#### Constructor

```typescript
new RedisEventHubStore(
  connectionOrConfig: Redis | RedisOptions | string,
  keyPrefix?: string
)
```

- `connectionOrConfig`: ioredis Redis instance, RedisOptions config, or connection string
- `keyPrefix`: Redis key prefix (default: 'pikku')

#### Methods

- `init()`: Initialize the store (verifies Redis connection)
- `getChannelIdsForTopic(topic)`: Get all channel IDs subscribed to a topic
- `subscribe(topic, channelId)`: Subscribe a channel to a topic
- `unsubscribe(topic, channelId)`: Unsubscribe a channel from a topic
- `close()`: Close Redis connection (if owned)

## Connection Management

The stores support two connection modes:

**Shared Connection** (recommended for multiple stores):
```typescript
const redis = new Redis('redis://localhost:6379')
const channelStore = new RedisChannelStore(redis)
const eventHubStore = new RedisEventHubStore(redis)
// Connection is shared, won't be closed by stores
```

**Owned Connection** (creates its own connection):
```typescript
const channelStore = new RedisChannelStore('redis://localhost:6379')
await channelStore.init()
// Later...
await channelStore.close() // Closes the connection
```

## License

MIT
