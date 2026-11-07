---
type: decision
title: The committed Go goldens stay, and CI checks them against Go
description: Three fixtures keep a stored slice of Go's output so cargo test needs no Go; golden-check.ts regenerates them from Go and fails when one is stale
tags: [inspector, inspector-rust, inspector-go, parity, ci]
---

# The committed Go goldens stay, and CI checks them against Go

Decided 2026-11-07.

```decision
chosen: Keep `addon-load/go.golden.json`, `trigger_feature/expected.go.json` and
  `workflow_edge/golden.json` under `inspector-parity/fixtures/`, and have
  `inspector-parity/scripts/golden-check.ts` run Go on each fixture, take the
  slice the Rust test compares, and fail when it differs from the committed file.
  CI runs it in the `inspector-parity` job with the host Go binary.
  `--update` rewrites the files, byte for byte in the committed format.
rules-out:
  - Making `cargo test` build or locate a Go binary: the three Rust tests read
    the goldens so that plain `cargo test` needs no Go toolchain
  - A golden nobody regenerates: a stored copy of Go's answer goes stale when Go
    moves, and the Rust tests would keep passing against the old answer
  - Reading every golden the same way: each one is captured at a different stage
because: Go is the reference, so a golden that no longer matches Go is wrong.
  The live Go-versus-Rust comparison over every project is parity.ts; these
  files are the small offline layer under it.
```

## Gotchas

- **Finalize changes the answer.** Go's `--stdin` finalizes; finalize adds
  diagnostics (PKU575, PKU124). `addon-load` is Go's pre-finalize analysis
  (`--no-finalize`); `trigger_feature` and `workflow_edge` are finalized. Reading
  `addon-load` finalized reports a PKU575 the golden never held, which looks like
  staleness and is not.
- **The slice is part of the claim.** Each Rust test compares only some state
  keys and some diagnostic codes. `golden-check.ts` repeats those requests,
  filters and root placeholders (`<ROOT>`, `<fixture>`, `<root>`); change both
  together.
- **A released Go prebuilt is the wrong oracle.** The 0.12.x prebuilts predate
  the branch's Go and report differences that are not staleness. Check against a
  build of the branch's own `pikku-inspect`.
- **Format.** One-space indent, no final newline, non-ASCII as `\uXXXX`.
