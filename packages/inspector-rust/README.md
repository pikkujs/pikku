# pikku-inspect-rs

A Rust port of the Go inspector (`packages/inspector-go`, `pikku-inspect`) on the
[tsrs](https://github.com/oxc-project/tsrs) compiler crates (a Rust port of
typescript-go). It lives **beside** the Go inspector and speaks the same JSON
protocol; the goal is byte-identical output on every project under `templates/`,
`recipes/` and `verifiers/`. Go is the reference; Rust is the default (DEFAULT_ENGINE) once
parity is proven. Read [PORTING.md](./PORTING.md) before porting anything.

Package `pikku-inspect-rs`, binary `pikku-inspect-rs`, library `pikku_inspect`.

## Using it

Select the engine with `PIKKU_INSPECTOR=rs`, `pikku <command> --inspector rs` or
`"inspector": "rs"` in `pikku.config.json`; `PIKKU_INSPECTOR_RS_BIN` points at a
binary you built (`cargo build --release`, Rust 1.99.1). CI builds it for
linux-x64, linux-arm64 and darwin-arm64, ships it in `@pikku/inspector-go`
under `prebuilt/<platform>-<arch>/pikku-inspect-rs`, and compares it with Go on
every project (`inspector-parity/scripts/parity.ts`). Why it exists and what is not proven:
[knowledge/decisions](knowledge/decisions/index.md).

## Status

This is the foundation: protocol, state, JSON encoding, diagnostics, program
creation, the analysis phase order, the visitor registry and the CLI. **No
visitor group is ported**, so an inspection returns a state with the program's
`rootDir` and nothing else filled in, finalized (`finalized: true`).

| Rust module | Go package | Status |
|---|---|---|
| `jsjson` | `internal/jsjson` | done; tests ported (JS number format, escaping, indent) |
| `state` (`ordered`, `raw`, `meta`) | `internal/state` | done; initial/populated goldens byte-identical, decode/encode round-trips |
| `diag` (+ generated `codes_gen.rs`) | `internal/diag` | done; all 110 codes generated from `error-codes.ts` |
| `protocol` | `internal/protocol` | done |
| `program` | `internal/program` | done: Go's compiler options, project-file filter, cross-request SourceFile `Cache` (works, see PORTING.md) |
| `analyze` | `internal/analyze` | phase order done; sweeps are empty; schema generation skipped |
| `visit` | `internal/visit` | `Context`, `Registry`, `Phase`, `Abort`, `order` keys, `Sweep`; shared helpers `util_*`, `usage_sweeps`; groups setup-core (`group_setup_core`), functions (+node), http (+contracts), rpc invocations, approval description, schedule, outgoing webhook; post-sweep `resolve_versions`, `service_types`, `finish_core_type_properties`. Boundary functions that live in other porters' Go files are in `boundary.rs` (stubs marked). Other post-sweep steps are still no-ops with their Go file named |
| `typesmap` | `internal/typesmap` | data structure, serialisation, `get_type_meta`; `CanonicalTypeString` is the identity (TODO) |
| `tsutil` | `internal/tsutil` | `walk`, `text`, `props`, `route`, `governance`, `print`, `sortjs`, `types`; `typeorder.rs` / `unionorder.rs` are STUBS for their porter |
| `schemas`, `tsjg` | `internal/schemas`, `internal/tsjg` | done except the Zod QuickJS route (Node only), the disk cache and the TypeToTypeNode union reorder; see PORTING.md |
| `finalize` | `internal/finalize` | done; byte-identical to Go on all 64 projects (`inspector-parity/scripts/finalize-parity.ts`) |
| `helpers` | `internal/helpers` | done: all 22 methods (see PORTING.md, "Helper methods"); `inspector-parity/scripts/helper-parity.ts` reports 0 differences |
| `sourcescan` | `internal/sourcescan` | done |
| `surface` | `internal/surface` | done |
| `typecheck` | `internal/typecheck` | done; `serve` answers `typeDiagnostics` |
| `main.rs` | `cmd/pikku-inspect` | `--stdin`, `inspect --stdin`, `finalize --stdin`, `serve` (inspect, typeDiagnostics, helpers), `schemas --stdin`, `helper <m>`; legacy bench mode not ported |

`serve` handles `inspect` end to end, `typeDiagnostics` and the helper methods.

## Build, run, test

Needs Rust 1.99.1 (edition 2024, the `rust-toolchain.toml` of tsrs). tsrs is a
git dependency pinned by revision in `Cargo.toml` (`b135f86e`); nothing is on
crates.io. A cold release build takes about 2 minutes.

```sh
cargo build --release
echo '{"routeFiles":["/abs/src/a.ts"],"options":{"rootDir":"/abs","tsconfig":"/abs/tsconfig.json"}}' \
  | target/release/pikku-inspect-rs --stdin
target/release/pikku-inspect-rs serve < requests.ndjson
cargo test
```

Set `CARGO_TARGET_DIR` to keep build output out of the tree.

## Layout

```
src/lib.rs       module list
src/main.rs      CLI (cmd/pikku-inspect/main.go)
src/jsjson.rs    JSON.stringify-compatible encoding
src/state/       State and its sections: ordered.rs (Record/Map/Set), raw.rs (Raw), meta.rs (typed metas)
src/diag/        Logger, Diagnostic, codes_gen.rs (gen_codes.sh regenerates it)
src/protocol.rs  Request / Response / Stats / ServeRequest / ServeResponse / Failure
src/program.rs   tsrs Program for (routeFiles, rootDir, tsconfig); Cache + CachingHost
src/analyze.rs   run(): the phase order of analyze.Run
src/visit/       Context, Registry, Phase, Abort; order.rs = the visit.ts order keys
src/typesmap.rs  TypesMap
src/tsutil.rs    walk + UTF-16 helpers
tests/golden/    state goldens shared with Go's state tests
```

## Public API to build on

* `visit::Context<'a>`: `checker: &mut Checker`, `state: &mut State`,
  `log: &mut Logger`, `options`, `root_dir`, `source_file`.
* A visitor group exposes `pub fn register(r: &mut Registry)` and is added to
  `visit::register_groups`. See the module docs of `visit/mod.rs`.
* State mutators are the field types: `Record::set/get/get_mut/delete`,
  `Map::set/...`, `Set::add/has`. Elements are the typed structs in
  `state/meta.rs`; sections still typed `Raw` take any `serde_json::Value`
  through `Raw::of`.
* `visit::abort(msg)` is the TS `throw`; `analyze::run` converts it to a
  `protocol::Failure` carrying the diagnostics logged so far.
