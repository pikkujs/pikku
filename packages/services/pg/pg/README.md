# @pikku/pg

PostgreSQL-based implementations of Pikku's ChannelStore and EventHubStore.

## Features

- **PgChannelStore**: PostgreSQL implementation of ChannelStore for persistent channel state
- **PgEventHubStore**: PostgreSQL implementation of EventHubStore for pub/sub topic subscriptions
- **Auto-initialization**: Automatically creates required schema and tables on startup
- **Configurable schema**: Use custom schema names (default: 'serverless')
- **Type-safe**: Full TypeScript support with generics

## Installation

```bash
npm install @pikku/pg postgres
# or
yarn add @pikku/pg postgres
```

## Usage

### Basic Setup

```typescript
import postgres from 'postgres'
import { PgChannelStore, PgEventHubStore } from '@pikku/pg'

// Create postgres connection
const sql = postgres({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'postgres',
  password: 'password',
})

// Create stores with default schema ('serverless')
const channelStore = new PgChannelStore(sql)
const eventHubStore = new PgEventHubStore(sql)

// Initialize (creates schema and tables)
await channelStore.init()
await eventHubStore.init()
```

### Custom Schema Name

```typescript
// Use a custom schema name
const channelStore = new PgChannelStore(sql, 'my_app')
const eventHubStore = new PgEventHubStore(sql, 'my_app')

await channelStore.init() // Creates 'my_app' schema
await eventHubStore.init()
```

### With Pikku Server

```typescript
import { createExpressServer } from '@pikku/express'
import { PgChannelStore, PgEventHubStore } from '@pikku/pg'
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!)

const channelStore = new PgChannelStore(sql)
const eventHubStore = new PgEventHubStore(sql)

await channelStore.init()
await eventHubStore.init()

const server = createExpressServer({
  channelStore,
  eventHubStore,
  // ... other options
})
```

## Database Schema

The stores automatically create the following tables:

```sql
CREATE SCHEMA IF NOT EXISTS {schema_name};

CREATE TABLE IF NOT EXISTS {schema_name}.lambda_channels (
    channel_id TEXT PRIMARY KEY,
    channel_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    opening_data JSONB NOT NULL DEFAULT '{}',
    user_session JSONB,
    last_interaction TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS {schema_name}.lambda_channel_subscriptions (
    channel_id TEXT NOT NULL REFERENCES {schema_name}.lambda_channels(channel_id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    PRIMARY KEY (channel_id, topic)
);
```

See `sql/schema.sql` for the complete schema.

## API

### PgChannelStore

Extends `ChannelStore` from `@pikku/core/channel`.

#### Constructor

```typescript
new PgChannelStore(sql: postgres.Sql, schemaName?: string)
```

- `sql`: postgres.Sql connection instance
- `schemaName`: PostgreSQL schema name (default: 'serverless')

#### Methods

- `init()`: Initialize the store (creates schema and tables)
- `addChannel(channel)`: Add a new channel
- `removeChannels(channelIds)`: Remove channels by IDs
- `setUserSession(channelId, session)`: Set user session for a channel
- `getChannelAndSession(channelId)`: Get channel data with session

### PgEventHubStore

Implements `EventHubStore` from `@pikku/core/channel`.

#### Constructor

```typescript
new PgEventHubStore(sql: postgres.Sql, schemaName?: string)
```

- `sql`: postgres.Sql connection instance
- `schemaName`: PostgreSQL schema name (default: 'serverless')

#### Methods

- `init()`: Initialize the store (creates schema and tables)
- `getChannelIdsForTopic(topic)`: Get all channel IDs subscribed to a topic
- `subscribe(topic, channelId)`: Subscribe a channel to a topic
- `unsubscribe(topic, channelId)`: Unsubscribe a channel from a topic

## License

MIT
