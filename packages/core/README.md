# @pikku/core

The Pikku runtime. Defines functions, wirings, services, middleware and the
types every other Pikku package builds on.

You rarely install this alone — a runtime package (`@pikku/express`,
`@pikku/lambda`, …) takes it as a peer dependency.

## Install

```bash
npm install @pikku/core
```

## Usage

Write functions against the types the CLI generates for your project:

```typescript
import { pikkuFunc } from '../.pikku/pikku-types.gen.js'

export const getTodo = pikkuFunc({
  input: GetTodoInput,
  output: TodoOutput,
  func: async (services, data) => services.db.getTodo(data.id),
})
```

Wire them to HTTP, queues, cron, channels or MCP, then run `npx pikku` to
regenerate the bootstrap files and typed clients.

Subpath exports cover the individual wiring types — `@pikku/core/http`,
`@pikku/core/workflow`, `@pikku/core/channel`, `@pikku/core/agent` and more.

## Docs

https://pikku.dev/docs
