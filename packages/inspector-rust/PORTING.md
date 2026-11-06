# Porting the inspector to Rust

`pikku-inspect-rs` ports `packages/inspector-go` onto tsrs. **Go is the oracle.**
Where the two disagree, the Rust side is wrong until Go is proven wrong (and
then Go is fixed first, in its own PR). The module layout mirrors Go's
`internal/` packages so a diff of the two trees reads as a translation; see the
table in [README.md](./README.md). Read `packages/inspector-go/PORTING.md` too:
every rule there about TypeScript parity still holds.

## Rules

1. **Port behaviour, not shape.** Where Go does something odd, copy it, keep
   Go's comment, and name the Go file in the Rust doc comment. Do not "clean up"
   an ordering or an omission: it is somebody's golden file.
2. **Same phase order.** `analyze::run_inner` is `analyze.Run` line for line.
   Visitors run per node in `order` (the `visit.ts` call index x 10), then the
   sweep descends.
3. **UTF-16 offsets.** Strada reports positions in UTF-16 code units; tsrs, like
   typescript-go, uses UTF-8 byte offsets. Every position that reaches the state
   (`position`, `bodyStart`, `bodyEnd`) goes through `tsutil::utf16_offset(text,
   byte_off)`. Never store a raw tsrs position.
4. **Ordering is part of the output.** JS object key order is reproduced by
   `state::Record` (array-index keys first, ascending, then insertion order;
   re-set keeps position, delete + re-add moves to the end). JS `Map`/`Set`
   are `state::Map`/`state::Set` (arrays, insertion order). Struct field order is
   the order of the TS object literal. Do not use `HashMap` or `BTreeMap` for
   anything serialised, and never iterate a hash map to produce output.
5. **JSON goes through `jsjson`.** `jsjson::marshal` writes numbers the
   `JSON.stringify` way (`1e+21`, `123456789012345680000`); plain
   `serde_json::to_string` does not. `Raw` holds a `serde_json::Value`
   (`preserve_order` is on), which re-encodes identically for anything
   `JSON.stringify` wrote.
6. **Omission rules** (Go struct tags to serde), documented in `state/meta.rs`:
   `omitempty` on a pointer is `Option` + `skip_serializing_if`; on a string or
   slice it is `is_empty`; `omitzero` on `Tags` is `Option<Vec<_>>` (None = nil
   slice = omitted, `Some(vec![])` = written `[]`). A Go nil slice without a tag
   writes `null`; a Rust `Vec` cannot be nil and writes `[]`. Visitors always set
   those fields, so the two agree on real input.
7. **Errors.** A TS `throw` in a visitor is `visit::abort(msg)` (an unwinding
   payload, `Abort`), caught only in `analyze::run_with`. Do not catch it
   anywhere else. Logged-then-thrown errors become `protocol::Failure`.
8. **Every change needs a test that fails before it.** Port the Go test with the
   same expected strings, then run both binaries on a real project (below).
9. Never edit `packages/inspector-go` from the Rust work.

## Checking parity

Build a request (routeFiles = the project's `src/**/*.ts`, `options.rootDir`,
`options.tsconfig`), run both binaries, compare the parsed JSON key by key. The
Go binary finalizes (`finalized: true`); until `finalize` is ported, compare the
analysis sections. The parity harness lives in `scripts/`.

Measured on `recipes/functions` (foundation commit): 30 route files, 30 project
files in both; `rootDir` and the 24 sections nothing writes to are equal as
parsed JSON, and the key order of the keys both emit is the same. Differences
are exactly the unported work: Go also has `analytics` and `serviceTypes`, the
swept sections, `validationPass`, and 4 diagnostics.

## Where tsrs differs from typescript-go

* **Object-type property order.** tsrs prints object-type properties in
  typescript-go's native order. The Go inspector then reorders them back to
  old-TypeScript (Strada) order: union members by type id and mapped-type
  properties by key-literal id (`internal/tsutil/typeorder.go`,
  `ReorderTypeNode`; the reasoning is in
  `packages/inspector-go/knowledge/decisions/union-and-property-order-follow-type-ids.md`).
  A Rust port must reproduce that reorder, including making the checker calls TS
  makes so ids are created in the same order (`dslCtx.touchType`). tsrs has a
  `stable_type_ordering` compiler option (`tsrs_core::CompilerOptions`); it has
  not been evaluated against Strada's order, do not assume it is the answer.
* **`typeToString` flags.** Always pass `TypeFormatFlags::NoTruncation` through
  one wrapper (`type_to_string_ex_exported`); never per call site. Several
  checker methods are `pub(crate)` in tsrs and are reached through `_exported`
  wrappers (`get_symbol_at_location_exported`, `type_to_string_ex_exported`,
  `get_type_arguments_exported`, `get_return_type_of_signature_exported`,
  `get_signature_from_declaration_exported`, `get_awaited_type_exported`).
* **Program lifetime.** `new_program` returns `&'static Program`; programs and
  their source files are leaked (the arena never frees). `Program::release` only
  drops the checker handle. A long-lived `serve` process therefore grows with
  every request that parses a changed file; unchanged files are reused through
  `program::Cache`, which is what keeps it bounded in practice.
* **Checker counts.** `Program::counts()` (types, instantiations, symbols) locks
  every checker and deadlocks if the checker handle is still held. `analyze`
  releases first. Counts differ from Go's (340 vs 2069 types on
  recipes/functions with empty sweeps; the sweeps do the checker work in Go, and
  the cause was not investigated further). Stats are not part of parity.
* **Parsed `.d.ts` / lib files.** `bundled::wrap_fs` serves the lib files
  embedded in tsrs, as typescript-go's `bundled` does (`bundled:///libs/...`).
* **`#imports` resolution.** typescript-go resolves package.json `#imports`
  subpaths with `.js` to `.ts` substitution where TS 6 does not (see the Go
  PORTING.md, which lists the project-file count differences). tsrs follows
  typescript-go, so expect the same extra generated files in the sweep.

## Known gaps

* **Visitor groups, typesmap `CanonicalTypeString`, schemas, finalize, source
  scans and every `helper` method are not ported.** `finalize::response` is a
  no-op, so `inspect --stdin` returns `finalized: false` where Go returns `true`
  (and no `validationPass`).
* **Legacy bench mode** (`pikku-inspect [-timing] <projectDir>`) is not ported;
  the CLI prints an error and exits 1.
* **`typeDiagnostics`** in `serve` (Go's `typecheck.Service`) answers with an
  error.
* **`stats.heapUsedMb` is always 0** (Go: `runtime.MemStats.HeapAlloc`);
  `stats.cpuMs` is read from `/proc/self/stat` and is 0 off Linux. Stats are
  informational.
* **Serve error text.** `bad request: ...` carries serde's parse message, not
  Go's `encoding/json` one. Request decoding ignores unknown fields, like Go.
* **`Raw` numbers.** `Raw` re-encodes numbers through `f64`, so an integer above
  2^53 in a verbatim section would lose precision (`u64`/`i64` that fit are kept
  exactly). TS state never holds one.
* **Duplicate keys** in a `Record` section decoded from JSON keep the last
  value at the first position (JS and Go agree for objects; `Raw` objects go
  through `serde_json::Map`, which does the same).
* **Go-only `Inputs/Outputs` nil `null`** cannot be expressed (see rule 6).

## Schemas (`schemas`, `tsjg`)

Ported: `internal/schemas` (names, custom types, the schema program with an
in-memory overlay FS, `generate_all`) and the whole vendored generator
`internal/tsjg` (types, schema, config, formatters, parsers, generator, wiring in
`tsjg/factory.rs`). `analyze::run` calls `schemas::generate_all` after the sweeps.
`pikku-inspect-rs schemas --stdin` (Rust only) takes `{state, options.schemaConfig}`
(any Go/Rust response works) and returns `{schemas, diagnostics, error?}`;
`PIKKU_SCHEMAS_REPLAY_VENDOR=1` answers the Zod step from the input state, to
measure the TypeScript side alone.

Measured against Go's `state.schemas` (64 projects, 1125 schemas): all 1125 are
byte-identical, key order included, 61/62 projects (the 62nd is online-shop, below).

Known gaps:

* **Zod conversion is Node only.** Go bundles the declaring modules with esbuild
  and runs them in QuickJS (`schemas/zodjs`), falling back to Node. Rust has no
  esbuild; `schemas::vendor::NodeConverter` runs `options.schemaConfig.vendorScript`
  (`scripts/vendor-schemas.mjs`) like Go's fallback. It needs the project's
  generated `.pikku/**/index.js` and installed `node_modules`: on a clean checkout
  17 of the 35 projects with schemas fail with "Cannot find module .pikku/...".
  Verified byte-identical on `verifiers/functions` (66/66 incl. 6 Zod) once `.pikku`
  exists. Matching Go on a clean tree needs an esbuild (binary) + JS-engine port.
* **No on-disk schema cache** (`go-ts-schemas.json`): performance only.
* **`TypeToTypeNode` has no Strada union reorder** (`tsjg/typenode.rs` uses tsrs's
  own order) until the tsutil typeorder/unionorder port lands; used for call
  expressions, Promise and object-literal spreads.
* **online-shop AwaitsCheckoutInput/CheckoutRun.** Go logs a PKU456 with a Go panic
  stack: `interface CheckoutRun extends ScenarioHttpResponse` where the import
  `#pikku/scenarios` is unresolved in the schema program; Go's
  `ExpressionWithTypeArgumentsNodeParser` does `aliasedSymbol.Declarations[0]` on
  a symbol with no declarations (index out of range). tsrs parses that heritage
  entry as a `TypeReference`, whose parser falls back to `any`, so Rust returns the
  schema (without the base members) and no diagnostic. Fix in Go: guard the empty
  declaration list like `TypeReferenceNodeParser` (`firstValidDeclaration`).
* Error text for internal Rust panics (Go: `internal error: ...` + stack) is not
  reproduced; `describe_node` reports a byte offset, not line:column.
* `locale_sort` of the virtual file's declarations is an approximation of ICU
  collation (affects only declaration order, never a schema).
