---
type: decision
title: A Rust inspector ships beside Go; Go is the oracle and parity is the exit criterion
description: pikku-inspect-rs on tsrs speaks the Go protocol, is selectable, and becomes the default only when the parity harness shows byte-identical output
tags: [inspector, inspector-rust, inspector-go, tsrs, ci]
---

# A Rust inspector ships beside Go; Go is the oracle and parity is the exit criterion

Decided 2026-11-06.

```decision
chosen: Build `pikku-inspect-rs` (packages/inspector-rust) on the tsrs compiler
  crates, speaking the same JSON protocol as `pikku-inspect`. Ship both in
  @pikku/inspector-go (prebuilt/<platform>-<arch>/), select with
  PIKKU_INSPECTOR / --inspector / the `inspector` config key, and keep the
  default in one constant (DEFAULT_ENGINE in packages/inspector-go/src/binary.ts)
  until the parity harness passes. Go stays the reference: when they differ,
  Rust is wrong.
rules-out:
  - Changing Go to match Rust, or "improving" behaviour in the port
  - Flipping the default on a feeling; the exit criterion is
    `inspector-parity/scripts/parity.ts` reporting every project
    byte-identical, with schemas, in CI
  - Falling back from one engine to the other at runtime
  - A Node/esbuild/tsx dependency in the Rust engine: it is meant to be entirely
    native, so the Zod route has to be solved in-process or reported as a gap
because: The Go engine needs the typescript-go source vendored with generated
  shims and cannot expose the checker's internals the way a Rust crate can;
  tsrs is a Rust port of typescript-go, so one binary, no cgo, and a checker we
  can call directly. Both engines at once gives a differential oracle for the
  port at no extra test-writing cost.
```

## Risks to keep in view

- **Upstream drift.** tsrs is pinned by git rev in `Cargo.toml`
  (`b135f86e4d13f5f5719aa0630001e3c860dc0d51`) and is a young project: it can
  change public API, checker behaviour and its required Rust (it pins 1.99.1,
  edition 2024, which CI mirrors in `.github/actions/setup-rust`). Moving the
  rev means re-running the parity harness and reading what moved; several
  checker methods are `pub(crate)` and reached through `_exported` wrappers that
  may not survive an update.
- **Go drift.** Go moves with typescript-go; the Rust port has to follow each
  Go change (PORTING.md lists which Go file each Rust module mirrors).
- **Glibc.** The Rust Linux binaries are dynamically linked (the Go ones are
  static), so they need a glibc at least as new as the CI runner's.

## What is not proven

- **Schemas.** The parity harness without `--schemas` is byte-identical on the 64
  projects. With schemas, the Zod route (Go converts in QuickJS) was the open
  part when this was written; the CI job `inspector-parity-schemas` is the
  measure and is non-blocking until it is green.
- **Corpus.** Parity is measured on the 64 projects in this repository. A user
  project using a pattern none of them use is untested; nothing guarantees
  agreement there.
- **Real `pikku all`.** One run of `pikku all` on recipes/functions with each
  engine produced 8 differing generated files of 265 (missing type aliases,
  a `WorkflowRunStatus` resolved to `null`, and two meta `position` offsets),
  so the generated output is not yet identical end to end.
- **Serve memory.** PORTING.md records that a long-lived `serve` leaks a
  program per `typeDiagnostics` request.

## Flipping the default

One commit changes `DEFAULT_ENGINE` to `'rs'` (and the docs/tests that name the
default). Before keeping it: parity jobs green and made blocking, no open item
above that affects generated output.

### Decision: Go stays the default until parity is proven

The maintainer wants Go to remain the default for now, and Rust to become the
default once parity is met. The default-flip commit exists on the
`inspector-rs-wiring` branch and is deliberately not merged. Rust is opt-in
(`PIKKU_INSPECTOR=rs`, `--inspector rs` or the `inspector` config key) until
the exit criteria above hold: generated output identical end to end, schemas
natively on a clean checkout, and peak memory within Go's. Then that one commit
is merged.
