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

* **Visitor groups, typesmap `CanonicalTypeString`, schemas and finalize are
  not ported.** (The `helper` methods and `typeDiagnostics` are: see "Helper
  methods" below.) `finalize::response` is a
  no-op, so `inspect --stdin` returns `finalized: false` where Go returns `true`
  (and no `validationPass`).
* **Legacy bench mode** (`pikku-inspect [-timing] <projectDir>`) is not ported;
  the CLI prints an error and exits 1.
* **Helpers: `internal/remotesdk`** is not reachable from `helpers` (only
  `visit` and `finalize` import it), so it is left to whoever ports those.
* **Helpers: leaked programs.** tsrs programs are `&'static` and never freed, so
  every `typeDiagnostics` request leaks the program it builds (about 3 MB per
  request on `packages/core`; Go's GC reclaims it). The parsed-file cache still
  bounds re-parsing; only the program/checker graph leaks. 40 requests on
  `packages/core`: Rust 205 MB peak RSS, Go 325 MB.
* **Helpers: Unicode tables.** `\p{L}`/`\p{Lu}`/`\p{N}` come from the `regex`
  crate's (newer) Unicode tables, Go's from its own; a character added to a
  category between the two versions classifies differently. None found on the
  repo corpus. `localeCompare` (member order in `collectSurface`) uses
  `icu_collator` (root collation) where Go uses `x/text/collate` (English);
  identical on all 335 collectSurface cases.
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

## Helper methods (`helpers`, `sourcescan`, `surface`, `typecheck`)

| Rust | Go | Notes |
|---|---|---|
| `helpers.rs` | `internal/helpers` | all 22 methods, batch forms included; result is a `RawValue` encoded by `jsjson` |
| `sourcescan/` | `internal/sourcescan` | one file per Go file (`parse`, `files`, `syntax`, `modspec`, `remoteaddon`, `jsxtext`, `jsxprops`, `pikkucall`, `messageusage`, `copytext`, `copyskip`, `sourcechecks`, `stubscan`, `tsconfig`) |
| `surface/` | `internal/surface` | `mod` (collect), `jsdoc`, `print`, `quotes`, `pkgjson` |
| `typecheck.rs` | `internal/typecheck` | `Service` per root, kept in `serve` |

Things that were not obvious:

* **Overlay type-check on the tsrs public API.** `typecheck::OverlayHost`
  wraps the caching `CompilerHost` and answers `get_source_file` for the overlay
  file from memory. tsrs additionally checks `fs.file_exists(root)` before it
  asks the host for a root file, so a *new* unsaved file (not on disk) was
  silently dropped; the host's `fs()` is therefore a `vfs::wrapvfs` over the real
  FS whose `file_exists` also answers true for the overlay file. Go does not need
  this. Proven on 345 diagnostics cases (saved, unsaved with errors, truncated,
  emoji, missing import, nonexistent root) across 20 projects: 0 differences.
* **`regex` is not RE2.** Go's `\b`, `\w`, `\d`, `\s` are ASCII; the `regex`
  crate's are Unicode. The patterns spell the classes out (`[0-9A-Za-z_]`,
  `(?-u:\b)`, the explicit `JS_WHITESPACE` class) wherever Go relied on ASCII.
* **Lone surrogates.** An escape such as `'\ud83d'` is kept by tsrs as WTF-8
  bytes inside a `&str` (invalid UTF-8, exactly as in a Go string). `NodeLit::lit`
  reads literal text through `fix_wtf8`, which turns each lone surrogate into a
  marker char (U+10D800..) and any other invalid byte into U+FFFD; `JsText`
  turns a marker back into the lone UTF-16 unit (Go's `utf16Units`), and
  `helpers::json` writes the remaining markers as three U+FFFD (what Go's JSON
  encoder does with the three bytes).
* **JSDoc `comment` is never absent in tsrs** and Go's is non-nil even for a
  tag-only comment (`/** @override */`), so `jsdoc::comment_list` reports it
  present; that is what stops doc inheritance in `collectSurface` (kysely's
  `Kysely.withSchema`).
* **Internal symbol names** start with U+007F in tsrs, 0xFE in Go; `symbol_name`
  and `is_reserved` use tsrs's prefix. Names sorted with the prefix could order
  differently from Go; none occurs among exports.

Verification: `scripts/helper-parity.ts` (196k+ cases) and
`tests/helpers_golden.rs` (Go's own goldens). See `scripts/README.md`.
