# Parity harness

Measures how far `pikku-inspect-rs` is from the Go `pikku-inspect` (the oracle)
on every Pikku project under `templates/`, `recipes/` and `verifiers/`.

## Setup (once per checkout)

```bash
bun install --ignore-scripts
(cd packages/core && bun run build)           # openapi-errors.ts imports @pikku/core/state
(cd packages/inspector-go && ../../node_modules/.bin/tsc -b)  # dist/vendor, needed by schema runs
```

## Scoreboard

```bash
bun packages/inspector-rust/scripts/parity.ts <goBin> <rsBin> \
  [--projects online-shop,verifiers/f*] [--schemas] [--finalize] \
  [--out dir] [--jobs 4] [--timeout 300] [--cap 5] [--no-cache]
```

- Projects: every directory with a `pikku.config.json` (node_modules/dist/dot dirs skipped), 64 at the time of writing.
  `--projects` is comma-separated; each entry is a substring or a `*` glob of the repo-relative path.
- Request: `projectInput` from `inspector-go/src/test-project-input.ts`, then `toAnalysisOptions` and
  `withOpenAPIErrors`, exactly what `inspect()` sends. `--schemas` keeps `schemaConfig` (the expensive part:
  about 35 s sequential for Go vs 8 s without). Without it schemas are not generated on either side.
  `recipes/*` that `extends` another config inherit its `rootDir` and so send identical requests; that is `projectInput`'s behaviour.
- Both binaries run as `<bin> --stdin` under `/usr/bin/time -f %M` (peak RSS) with a timeout.
  `--finalize` instead runs `<bin> finalize --stdin` on Go's own finalized state (Go has no pre-finalize emitter,
  so this is an idempotence-style probe of the Rust finalize, not the real pre-finalize state).
- Go results are cached in `<out>/go-cache` keyed by sha256(binary) + request; a rebuilt Go binary re-runs.
- Exit status 0 only if every project is byte-identical (or fails the same way Go does).

Outputs in `--out` (default `.../scratchpad/parity/`): `summary.md` (the scoreboard), `results.json`,
`diffs/<project>.json` (full per-key report) and `.request.json`, `rust-output/<project>.json` (raw Rust stdout).

`golden.ts [goBin] [--schemas] [--out dir]` stores Go's answer key under `<out>/golden/`: raw `<project>.json`,
`.normalised.json`, `.request.json`, and `index.json` (exit code, error, wall ms, peak RSS).

## Finalize-only parity

```bash
bun packages/inspector-rust/scripts/finalize-parity.ts <goBin> <rsBin> [--projects ...] [--schemas] [--out dir] [--jobs 4]
```

Takes Go's PRE-finalize state (`<goBin> --stdin --no-finalize`, so `goBin` must be a build with that flag),
sends it to `finalize --stdin` of both binaries and compares the outputs byte for byte, with the same
normalisations and the same per-key report as `parity.ts`. The Rust analysis does not take part.

## Normalisations (everything else is compared as raw text)

Applied as text substitutions on stdout (key order and number formatting stay untouched), counts recorded per
project in `results.json`:

1. `stats.{wallMs,cpuMs,heapUsedMb,types,instantiations,symbols}` -> `0`, inside the top-level `"stats"` object only.
   `files`, `projectFiles`, `filesReused` are compared.
2. The repo root absolute path -> `<REPO>`.
3. Absolute temp paths (`os.tmpdir()`, `/tmp/...`, `/var/folders/...`) -> `<TMP>`.
4. In diagnostic strings containing a Go panic stack (`goroutine 1 [running]`), hex values not preceded by `+`
   -> `0xADDR`. This is the only nondeterminism Go has besides stats (see below).

## Reading the scoreboard

- First line: `keys identical: X of Y across P projects`. A "key" is one top-level key of the response, with
  `state` flattened to `state.<key>` (plus `diagnostics`, `stats`, `finalized`, `protocol`, `validationPass`, `error`).
  Y counts the union of keys per project; keys missing in or extra in Rust count as not identical.
  Projects where Go itself fails are excluded from X/Y and judged separately (same exit code, stdout and stderr
  = `expected-failure-match`).
- A key is identical when its order-preserving serialisation is equal. `different (key order only)` means the
  leaf values agree but object key order differs.
- Per-key table: projects identical / different / missing, total leaf diffs. Per-project table: status, keys ok,
  timings, RSS, differing keys. The matrix is one char per key (`+` identical, `X` not, `.` absent in both);
  the legend maps column index to key.
- Details section: first differing byte offset with 60 bytes of context each side, then for each differing key
  (first 3 per project) the leaf count and the first `--cap` JSON-pointer paths with `go=` and `rs=` values.
- The raw-text byte check is the final authority: a project is `identical` only if normalised stdout is byte-equal.
  The structural report is derived afterwards, so number formatting differences (1 vs 1.0) show as a byte
  diff with all keys identical.

## Known facts about the oracle

- Go output is deterministic run to run except stats and the stack addresses in rule 4 (verified by two full
  runs with schemas, zero differences after normalisation).
- With `--schemas`, Go panics inside schema generation for `templates/online-shop` (`AwaitsCheckoutInput`,
  `ExpressionWithTypeArgumentsNodeParser`, index out of range) and records the whole stack, with absolute
  Go source paths, in a PKU456 diagnostic. That diagnostic cannot be reproduced by Rust; fix it in Go first.
- With `--schemas`, `verifiers/addon-dependencies/billing` and `verifiers/pikku-studio` fail ("Schema generation
  failed for 2 schemas": the Zod vendor script cannot import `.pikku/addon/function/index.js`, which exists only
  after a `pikku all`). They are tracked as expected failures.

## Helper parity

`helper-parity.ts` is the differential tester for the helper methods and
`typeDiagnostics` (the `serve` protocol, Go vs Rust, byte for byte):

```bash
bun packages/inspector-rust/scripts/helper-parity.ts <goBin> <rsBin> \
  [--methods a,b] [--repo dir] [--mutations N] [--dirs N] [--tc N] [--show N]
```

Inputs come from every tracked `.ts`/`.tsx` in the repo plus `--mutations`
mutated variants of each (truncated, character dropped, emoji, CRLF/U+2028,
missing paren/brace), JSX positions, directory trees (including a scratch tree
with invalid UTF-8, BOM and lone surrogates), every package for `collectSurface`
(and each `imports` key), every tsconfig, and real projects for
`typeDiagnostics` with unsaved overlays. Use `--repo` with a checkout that has
`node_modules` (type-checking resolves packages). Prints cases and differences
per method; exits 1 on any difference.

## Real-CLI parity (what `pikku all` actually sends)

The synthetic request of `parity.ts` leaves out what the real CLI adds (scaffold
files under `pikku/` and `.pikku/`, several passes with different options). Two
scripts close that gap:

```bash
bun packages/inspector-rust/scripts/generate-parity.ts <goBin> <rsBin> --cli <pikku.js> \
  [--corpus default|extra|tracked] [--projects ...] [--out dir]
bun packages/inspector-rust/scripts/parity.ts <goBin> <rsBin> --captured <that out dir> [--corpus tracked]
```

`generate-parity.ts`, per project: `git clean` the project and its rootDir, run
`pikku all` with the Go binary (cold), run it again over its output (warm), harvest every
file the runs left behind, then the same for the Rust binary. `capture-wrapper.sh` is
installed as `PIKKU_INSPECTOR_GO_BIN`/`_RS_BIN` and tees each request (`--stdin`, `serve`
NDJSON, `helper <m>`) to `<out>/captured/<project>/<cold|warm>/<engine>/`. After each Go
run, while the generated state exists, every captured request is replayed against both
binaries and compared byte for byte (same normalisations as `parity.ts`). The trees
are compared file by file; `.pikku/runs/` (timestamped run logs) is the only exclusion.
`--corpus default` is templates/recipes/verifiers (64), `tracked` every
`git ls-files '*pikku.config.json'`, `extra` the difference. The default outDir is
used on purpose: the CLI's Zod step imports from `.pikku/` and `--outDir` elsewhere
makes `pikku all` abort part-way, where file timing differs from run to run.

`parity.ts --captured` replays stored requests against the checkout as it is now; it is
only exact while the generated scaffold from the Go run still exists.
