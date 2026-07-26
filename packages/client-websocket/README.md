# @pikku/websocket

Type-safe WebSocket client for Pikku channels. Message names and payloads are
checked against your generated channel wirings.

## Install

```bash
npm install @pikku/websocket
```

## Usage

```typescript
import { pikkuWebsocket } from './.pikku/pikku-websocket.gen.js'

const channel = pikkuWebsocket('events')

channel.subscribe('todoAdded', (todo) => console.log(todo))
await channel.send('addTodo', { text: 'buy milk' })
```

Generate the client with `npx pikku`.

## Docs

https://pikku.dev/docs
