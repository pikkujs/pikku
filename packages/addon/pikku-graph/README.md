# @pikku/addon-graph

Built-in `graph:*` primitives for Pikku workflow graphs — the pure transforms
(map, cast, filter and friends) that graphs compose without needing a bespoke
addon per operation.

## Install

```bash
npm install @pikku/addon-graph
```

## Usage

Reference the primitives by name from a workflow graph:

```typescript
{ type: 'graph:map', input: { items: ref('fetch.output') } }
```

## Docs

https://pikku.dev/docs
