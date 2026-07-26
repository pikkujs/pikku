# @pikku/react

React bindings for Pikku — a provider plus hooks for fetch, RPC, AI agents,
workflows and realtime channels.

Also owns the `I18nString` brand that `@pikku/mantine` uses to reject
untranslated string literals at compile time.

## Install

```bash
npm install @pikku/react
```

## Usage

```typescript
import { PikkuProvider, usePikkuRPC, createPikku } from '@pikku/react'

const pikku = createPikku(PikkuFetch, PikkuRPC, options)

const App = () => (
  <PikkuProvider pikku={pikku}>
    <Todos />
  </PikkuProvider>
)

const Todos = () => {
  const { data } = usePikkuRPC('getTodos', {})
  return <List items={data} />
}
```

## Docs

https://pikku.dev/docs
