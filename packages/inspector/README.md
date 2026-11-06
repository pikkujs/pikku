# @pikku/inspector

The state Pikku's inspection produces: its types (`InspectorState` and the
meta types), the `ErrorCode` registry, the serializers, and the data helpers the
CLI generates code from. The inspection itself runs in the `pikku-inspect`
binary from `@pikku/inspector-go`; this package depends on no TypeScript
compiler.

Most users get this transitively via `@pikku/cli`; install it directly only if
you are building your own tooling on top of Pikku's introspection.

## Install

```bash
npm install @pikku/inspector
```

## Usage

```typescript
import { deserializeInspectorState, ErrorCode } from '@pikku/inspector'
import { inspect } from '@pikku/inspector-go'

const state = await inspect(logger, routeFiles, { rootDir })
```

Diagnostics come back as `CodedDiagnostic` values with a stable `ErrorCode`.

## Docs

https://pikku.dev/docs
