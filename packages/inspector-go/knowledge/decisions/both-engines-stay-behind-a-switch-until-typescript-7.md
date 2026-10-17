---
type: decision
title: Both inspector engines stay, behind a switch, until TypeScript 7 has a compiler API
description: The TypeScript inspector is the default and the Go engine (native) is opt-in through one resolver; both are held byte-identical by the parity harness, and the TypeScript one is retired only once TypeScript 7 ships a stable API
tags: [inspector, inspector-go, cli]
---

# Both inspector engines stay, behind a switch, until TypeScript 7 has a compiler API

`@pikku/inspector-go` runs analysis and finalize in the `pikku-inspect` binary,
built on the pinned typescript-go (TypeScript 7). `@pikku/inspector` runs the same
pipeline on the TypeScript 6 compiler API. Both are supported, and they produce
byte-identical generated output.

```decision
chosen: Two supported engines behind one switch. `typescript` is the default;
  `native` (the Go binary) is opt-in. Precedence: the `--inspector` flag, then
  the PIKKU_INSPECTOR env var, then `inspector` in pikku.config.json, then
  typescript.
rules-out:
  - Deleting the TypeScript inspector, its compiler-API code or its typescript
    dependency before TypeScript 7 ships a stable compiler API
  - Falling back to the TypeScript engine when no native binary exists for the
    platform; that is an error that names the opt-in
  - Engine choice made anywhere but resolveInspectorEngine
    (packages/cli/src/inspector-engine.ts)
  - A `go` alias for `native`
because: The native engine is faster and is
  where TypeScript is going, but it has not run in the wild yet, so it starts
  as an opt-in (decided 2026-10-17, reversing a native default). A binary per
  platform can be missing, and a native-engine bug must have a workaround a
  user can reach without a release.
  The TypeScript engine is also the reference the Go output is diffed against,
  so it has to keep working either way.
```

## What holds the two together

- **Parity is measured, in CI.** `parity/parity.ts --strict` compares each
  project's state after analysis and after finalize, and the diagnostics of each
  phase, section by section, against the TypeScript engine; `finalize-parity.ts`
  feeds the Go finalize the TypeScript analysis alone. The `Inspector parity`
  job runs both on `templates/functions` and `examples/field-service`.
  `allow-list.json` records every accepted difference with a reason.
- **One resolver.** `createConfig` resolves the engine once and records it, so
  the inspection, the source helpers in `inspector-helpers.ts`
  (`collectSurface`, `readModuleSpecifiers`, `readJsxLiteralText`,
  `readTsconfigOutDir`, `scanFrontend`) and the codegen child that watch mode
  spawns (passed `--inspector`) all run on the same engine.
- **No live compiler objects reach the CLI.** Whatever codegen reads crosses as
  serialized state (`serviceTypes`, not `typesLookup`), so either engine can
  feed it. `typesLookup` and `program` exist only inside the TypeScript engine
  and are cleared after inspection to release memory.

## When it ends

Re-check when TypeScript 7.1 lands its stable API. At that point the TypeScript
engine is retired, and
[@pikku/inspector keeps only its TypeScript-free parts](after-cutover-inspector-keeps-only-its-typescript-free-parts.md).
Until then every inspector change lands in both engines, and the parity job is
what says it landed the same.

See [analysis and finalize meet at a serialized state](analysis-and-finalize-meet-at-a-serialized-state.md)
for the boundary the two engines share.
