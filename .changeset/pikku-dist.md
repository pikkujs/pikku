---
'@pikku/cli': patch
---

Add `pikku dist`, and use it as the generated addon's build step.

`tsc` compiles the `.ts` under the pikku out dir, but it never carries the
`*.gen.json` meta written beside them, and it never re-emits a hand-authored
`.d.ts`. Both are needed at runtime — `MetaService` opens the meta off disk by
path — so a package that ships only tsc's output answers every meta lookup with
nothing.

Every generated addon papered over this with `tsc && cp -r .pikku types dist/`,
which copied two whole directories: it dragged 52 raw `.ts` sources into the
published output alongside the compiled ones, and needed a POSIX shell. Since
the script comes from the CLI, every project carried the same line.

`pikku dist` copies exactly what tsc could not emit, to where tsc would have put
it, reading the layout from `pikku.config.json` and the destination from the
tsconfig's `outDir` (or `--dist-dir`). The generated build script is now
`tsc && pikku dist`.
