# @pikku/inspector

The TypeScript inspector behind the Pikku CLI. Walks your source with the
TypeScript compiler API to discover functions, wirings and their types, and
produces the state the CLI generates code from.

Most users get this transitively via `@pikku/cli`; install it directly only if
you are building your own tooling on top of Pikku's introspection.

## Install

```bash
npm install @pikku/inspector
```

## Usage

```typescript
import { inspect, getInitialInspectorState } from '@pikku/inspector'

const state = getInitialInspectorState()
await inspect(['src'], tsconfigPath, state)
```

Diagnostics come back as `CodedDiagnostic` values with a stable `ErrorCode`.

## Docs

https://pikku.dev/docs
