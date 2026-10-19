---
type: decision
title: Zod schemas convert in QuickJS inside the binary, Node only as a fallback
description: esbuild bundles the schema modules with stubbed package imports and QuickJS runs the real z.toJSONSchema; a schema that touches a stub goes to Node, or is an error without it
tags: [inspector-go, schemas, zod]
---

# Zod schemas convert in QuickJS inside the binary, Node only as a fallback

A Zod schema is a value made by running JavaScript, so something has to run it.
`internal/schemas/zodjs` bundles every module that declares a schema with esbuild
(its Go API), using the project's own `zod`, and runs the bundle in QuickJS
compiled to WebAssembly and run by wazero, so the binary stays pure Go and
static. The bundle runs the same `processZodSchema` as `scripts/vendor-schemas.mjs`,
with `zodToTypeText` and `findZodTransform` bundled from `@pikku/inspector`'s
sources into `helpers.gen.js` (`go generate`; `TestHelpersAreCurrent` fails when
it is stale).

Every import that is not `zod` and resolves outside the project, or into
`node_modules`, is replaced by a stub, so a module that opens a database pool or
reads `node:fs` while it loads still loads. A schema built from a stub would
convert to something plausible and wrong, so:

- each schema's object graph is walked for a stub before it is converted:
  every own property, not only the enumerable ones (Zod keeps a schema's and
  every check's definition under a non-enumerable `_zod`), plus each node's
  metadata in `z.globalRegistry` (`.describe()`, `.meta()`);
- a stub turned into a string or number throws, so the module fails to load;
- a stub has one enumerable key, so `Object.values(stub)` is not an empty list.

Such a schema, or every schema of a module that does not load, goes to the Node
converter. Without `node` on the PATH or the script on disk (inside a compiled
CLI), it is an error naming the package, never a silent conversion.

On templates/field-service (81 schemas) the in-binary conversion is about
0.1 s and the binary's peak is about 200 MB, against 0.34–0.77 s and a separate
Node process peaking at 167 MB beside the binary's own. It adds about 8.5 MB to
each binary (3.3 MB gzipped).

```decision
chosen: Run the real Zod in QuickJS inside pikku-inspect, Node only for schemas that touch a stubbed import.
rules-out:
  - Reimplementing Zod's JSON Schema output by reading the schema's source in Go
  - Requiring Node for any project with a Zod schema
  - Embedding a copy of zod in the binary
because: Only the project's own Zod gives the TypeScript engine's output
  exactly, and a compiled CLI (Homebrew, the Studio sidecar) has neither Node
  nor the vendor script on disk.
```

> [!WARNING]
> A package value that only steers which schema is built
> (`LIB.strict ? z.string() : z.number()`) leaves nothing behind to find: a
> stub is always truthy. That takes a package flag deciding a wire schema's
> shape while the module loads.
