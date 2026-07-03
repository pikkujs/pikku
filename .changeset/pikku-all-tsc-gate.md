---
"@pikku/cli": patch
---

Add optional `--tsc` / `--tsc-summary` type-check gate to `pikku all`

`pikku all` previously never ran the TypeScript compiler for type errors — the
inspector builds a program only for AST traversal (with `skipLibCheck`,
`types: []`, no `lib`/`paths`) and never requests diagnostics, so real type
errors were silently ignored by codegen.

Two opt-in flags now run a genuine `tsc --noEmit` over the project's own
tsconfig after codegen completes (so generated `.pikku` files are included,
matching a real build) and fail the run on type errors:

- `--tsc` — full diagnostics with code frames.
- `--tsc-summary` — a compact one-line-per-error render (flattened messages, no
  code frames, `node_modules` filtered, capped at 50) that's cheap for AI
  agents and CI logs.

Both are off by default (zero cost on a normal run).
