---
type: decision
title: Both inspector engines stay, behind a switch, until TypeScript 7 has a compiler API
description: The Go engine (native) is the default and the TypeScript inspector is selectable through one resolver; both are held byte-identical by the parity harness, and the TypeScript one is retired only once TypeScript 7 ships a stable API
tags: [inspector, inspector-go, cli]
---

# Both inspector engines stay, behind a switch, until TypeScript 7 has a compiler API

`@pikku/inspector-go` runs analysis and finalize in the `pikku-inspect` binary,
built on the pinned typescript-go (TypeScript 7). `@pikku/inspector` runs the same
pipeline on the TypeScript 6 compiler API. Both are supported, and they produce
byte-identical generated output.

```decision
chosen: Two supported engines behind one switch. `native` (the Go binary) is
  the default; `typescript` is selectable. Precedence: the `--inspector` flag,
  then the PIKKU_INSPECTOR env var, then `inspector` in pikku.config.json,
  then native, which falls back to typescript with a warning only when no
  binary exists for the platform.
rules-out:
  - Deleting the TypeScript inspector, its compiler-API code or its typescript
    dependency before TypeScript 7 ships a stable compiler API
  - Falling back to the TypeScript engine when `native` was chosen explicitly
    and no binary exists; that is an error that names the TypeScript engine
  - Engine choice made anywhere but resolveInspectorEngine
    (packages/cli/src/inspector-engine.ts)
  - A `go` alias for `native`
because: The native engine is several times faster, uses far less memory and
  is where TypeScript is going, so it is the default (decided 2026-10-17, after
  briefly making it opt-in; parity held on the org apps). A binary per
  platform can be missing, so the default degrades to typescript rather than
  breaking the build, and a native-engine bug must have a workaround a user can
  reach without a release.
  The TypeScript engine is also the reference the Go output is diffed against,
  so it has to keep working either way.
```

## What holds the two together

- **Parity is measured, in CI.** `pikku inspector parity` runs codegen with
  both engines and fails unless the saved state, the generated files and the
  diagnostics match; CI runs it on every example, template and verifier (see
  the CLI's `inspector-parity-runs-on-every-project` decision).
  `finalize-parity.ts` feeds the Go finalize the TypeScript analysis alone, on
  `recipes/functions` and `examples/field-service`.
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
