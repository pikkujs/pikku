# Porting the inspector to Go

`pikku-inspect` is `@pikku/inspector` (`packages/inspector`) on
[typescript-go](https://github.com/microsoft/typescript-go). It builds the
program, runs the visit sweeps, resolves versions, generates schemas and runs
finalize, returning the finalized state (`finalized: true`).

It is the CLI's default engine (`native`); the TypeScript inspector stays
supported beside it, selected with `inspector: 'typescript'` in
pikku.config.json, `--inspector typescript` or `PIKKU_INSPECTOR=typescript`,
until TypeScript 7 ships a compiler API. See
`knowledge/decisions/both-engines-stay-behind-a-switch-until-typescript-7.md`.

The TS wrapper and the `parity/` harness live outside the Go tree; the engine
switch is `packages/cli/src/inspector-engine.ts`.

## Layout

```
cmd/pikku-inspect/   main.go: subcommand dispatch (--stdin, inspect --stdin, serve)
                     legacy.go: bench mode, pikku-inspect [-timing] [-files f] [-schemas] [-setup-only] <projectDir>
internal/analyze/    Run(Request, *program.Cache): inspector.ts lines 337-485, in order
internal/protocol/   Request / Response / ServeRequest / ServeResponse (protocol: 1)
internal/program/    program + checker with inspector.ts's compiler options; cross-program SourceFile Cache
internal/visit/      Context (the sweep state), the registry, one group_*.go per add-*.ts, util_*.go helpers
internal/state/      the full serializable InspectorState (serializeInspectorState byte-for-byte), ordered Record/Map/Set
internal/typesmap/   types-map.ts
internal/schemas/    schema-generator.ts (generateAllSchemas) and its vendor (Zod) converter hook
internal/tsjg/       vendored ts-json-schema-generator-go v3.0.0-native.6 (MIT)
internal/diag/       logger, diagnostics, ErrorCode constants generated from error-codes.ts (gen_codes.sh)
internal/jsjson/     JSON.stringify-compatible encoding (key order, escaping, number format)
internal/tsutil/     AST/text helpers with no Context: printing, props, walking, routes, UTF-16 offsets
shim/                generated re-exports of typescript-go internals (tools/gen_shims)
npm/                 one prebuilt-binary npm package per platform (see Distribution)
bench/               TS reference scripts, section compare, timing/RSS bench
```

### Protocol

`pikku-inspect --stdin` reads one request and writes one response:

```
in:  {"routeFiles":[...],"options":{"tsconfig?","rootDir?","setupOnly?","types?","schemaConfig?"}}
out: {"protocol":1,"finalized":false,"state":{...},"diagnostics":[{"level","code?","message"}],"stats":{...}}
```

- `setupOnly` runs only the setup sweep, as in TS.
- `types` is passed through untouched; only finalize reads it.
- `schemaConfig` turns schema generation on. `schemaConfig.vendorScript` names
  the Node script that converts Zod schemas (see Schema generation).

`pikku-inspect serve` reads NDJSON `{"id","method":"inspect","params":<request>}`
and answers `{"id","result"|"error"}` per line.

- One process keeps a `program.Cache` of parsed and bound SourceFiles across
  requests. A file is reused when its path, parse options and text are
  unchanged.
- Each request gets a new checker. `Prune` drops files that the last request
  did not touch.
- The cache is a read-through optimisation. A cold process gives the same
  answer, so the stateless/serverless rule holds.
- Measured on examples/online-shop (123 functions):
  - cold: 224 ms, 0 files reused
  - warm: 140 ms, 1933 reused
  - one function file touched: 175 ms, 1932 reused
  - round-trip overhead: about 5 ms

## Adding a visitor group

1. Port `add/add-foo.ts` to `internal/visit/group_foo.go`. Register it from
   `init()`:

   ```go
   func init() {
       Register(Visitor{Name: "addFoo", Phase: PhaseRoutes, Order: OrderAddFoo, Visit: (*Context).addFoo})
   }
   ```

2. Take the order key from `order.go`. Every `add*` call in `visit.ts` already
   has one there (its index × 10). A group therefore runs at its TS position
   no matter which file registers it.
3. If the group needs new state fields, type them in `internal/state`. Many
   sections are still `state.Raw`. Typing one must keep
   `TestStateRoundTripsTSOutput` passing.
4. Rewrite references in `ResolveLatestVersions.updateWiringReferences` if the
   group stores `pikkuFuncId`s.
5. Add the group's name to `TestRegisteredGroups`. Add its section to
   `bench/compare.py` if it is not there.
6. Run the parity commands below.

Rules that bite:
- Copy every log/diagnostic message from the TS source verbatim. The parity
  diff compares diagnostics as a multiset.
- Registration calls must stay detectable statically: match on the callee
  identifier exactly as TS does.

## Helper inventory

| Go | TS |
|---|---|
| `tsutil.PrintNode` | `node.getText()` / printer, with Strada's `(x!).y` printing |
| `tsutil.GetPropertyValue`, `GetArrayPropertyValue`, `FindPropertyAssignment`, `FoldStaticString` | `utils/get-property-value.ts`, `extract-node-value.ts` |
| `tsutil.UnwrapAs`, `UnwrapNonNullParens`, `IsRpcExpr` | inline unwrapping in add-rpc-invocations / add-functions |
| `tsutil.Walk`, `WalkSelf`, `CollectInvokedRpcNames`, `CollectStartedWorkflows` | `ts.forEachChild` recursion |
| `tsutil.PathParams` | `pathToRegexp(route).keys` (path-to-regexp 8.4 parse + flatten, same error text) |
| `tsutil.RouteMatchesPattern` | `utils/middleware.ts routeMatchesPattern` |
| `tsutil.FuncIdToTypeName`, `FormatVersionedId`, `UTF16Offset` | `extract-function-name.ts`, `@pikku/core` versioning, JS string offsets |
| `tsutil.NullifyType`, `IsPrimitive`, `IsVoidLikeType`, `IsLibFile`, `SymbolName` | type helpers in add-functions / resolve-function-types |
| `Context.extractFunctionName`, `getCommonWireMetaData`, `getPropertyAssignmentInitializer`, `resolveFunctionDeclaration`, `extractFunctionNode` | `extract-function-name.ts`, `get-property-value.ts`, `extract-function-node.ts` |
| `Context.resolveMiddleware`, `resolveHTTPMiddleware`, `resolveChannelMiddleware`, `resolveAgentMiddleware`, `resolvePermissions`, `refId` | `utils/middleware.ts`, `utils/permissions.ts`, `resolve-ref-contract.ts` |
| `Context.typeToString`, `resolveTypeImports`, `getNamesAndTypes`, `unwrapPromise*`, `resolveTypeName` | `add-functions.ts` type resolution |
| `Context.resolveSchemaRef`, `detectSchemaVendor*` | `detect-schema-vendor.ts` and the schemaLookup branch of add-functions |
| `visit.ParseVersionedId`, `Context.ResolveLatestVersions` | `@pikku/core parseVersionedId`, `utils/resolve-versions.ts` |
| `typesmap.TypesMap` | `types-map.ts` |
| `jsjson.Marshal` | `JSON.stringify` |

## Parity

The ported sections must match exactly on examples/online-shop and
templates/functions:
- functions (meta, files, typesMap)
- http
- queueWorkers
- schemas

```sh
B=$(mktemp -d)
go build -o $B/pikku-inspect ./cmd/pikku-inspect
# TS reference: the analyze steps through packages/inspector/dist (build it first)
node bench/ref-analyze.mjs ../../examples/online-shop $B/ts.json --schemas
$B/pikku-inspect -schemas ../../examples/online-shop > $B/go.json
python3 bench/compare.py $B/ts.json $B/go.json            # per-section summary + diagnostics multiset
python3 bench/compare.py $B/ts.json $B/go.json -v --only=functions.typesMap
# schemas only, against the pre-schema TS state
node bench/ref-schemas.mjs ../../examples/online-shop $B/ref.json
PIKKU_SCHEMA_PARITY_REF=$B/ref.json go test ./internal/schemas -run Parity -v
# timing + RSS
bench/bench.sh ../../examples/online-shop $B/pikku-inspect 3 $B/bench [--schemas]
```

Notes on the comparison:
- `compare.py` reports an entry that differs only in token order as
  "order-only".
- For a ported section, no difference is acceptable, order-only included:
  union and property order reach schema `enum`/`required` arrays and with them
  the contract hashes (see "Union and property order" below).
- Sections owned by unported groups show gaps until those groups land: rpc,
  usedFunctions, credentials and some diagnostics.

Current status (with schemas):

| section | online-shop | templates/functions |
|---|---|---|
| functions.meta / files | OK | OK |
| functions.typesMap | OK | OK |
| http.*, queueWorkers.* | OK | OK |
| import maps, factories, wireServicesMeta, coreTypeProperties, secrets, variables | OK | OK |
| schemaLookup | OK | OK |
| agents, scorers, mcpEndpoints | OK | OK |
| schemas | OK | OK |

## typescript-go differences

Each of these was found by a parity diff. Each is handled where noted.

- **`(x!).y` printing.** Strada keeps the parentheses around a non-null
  assertion that the source had; tsgo's printer drops them. This affects
  `implementationHash`. `tsutil.PrintNode` uses a paren-tracking writer to
  match Strada.
- **Internal symbol names.** tsgo prefixes internal names with `\xFE`
  (`\xFEdefault`, `\xFEcomputed`…) where TS uses `__`/`default`.
  `tsutil.SymbolName` maps them back. Never compare `sym.Name` raw.
- **Offsets.** tsgo node positions are UTF-8 byte offsets; TS ones are UTF-16
  code units. Anything that leaves the process as a position goes through
  `tsutil.UTF16Offset`.
- **typeToString flags.** `checker.TypeToString` defaults differ from TS's
  `checker.typeToString(t)`. Go calls `tsutil.TypeToString(c, t,
  TypeFormatFlagsNoTruncation)` (`Context.typeToString`). Change it there
  only, never per call site.
- **Lib paths.** Default lib files live at `bundled:///libs/lib.*.d.ts`, not
  `node_modules/typescript/lib`. `tsutil.IsLibFile` recognises both.
- **`GetSymbolAtLocation` on an import** returns the alias symbol. Resolve it
  (`Context.resolveAlias`) before reading declarations.
- **Union and property order.** tsgo sorts union members by value
  (`"high" | "low" | "medium"`); TS sorts them by type id, which is creation
  order. The same sort reorders the properties of a mapped type over a key
  union (Kysely `Selection`, `Pick`, `Record`), and tsgo lists a widened object
  literal's gained `?: undefined` properties by declaration position where TS
  appends them. All of it reaches schema `enum`/`required` and the contract
  hashes. Handled in `internal/tsutil`:
  - `TypeToString` and `TypeToTypeNode` (used by `Context.typeToString` and
    every `tsjg` parser) walk the printed node with the type it came from and
    sort union members by type id and mapped-type properties by key literal
    id (`ReorderTypeNode`). Never call the checker's printers directly.
  - `UnionTypesInIdOrder` is the same order for code that iterates
    `t.Types()` itself (`getNamesAndTypes`).
  - Ids are creation order, so Go must make the checker calls TS makes, when
    TS makes them. The DSL workflow extractor asks for each step output's
    type for that reason alone (`dslCtx.touchType`).
  Strada's order is itself only as stable as its check order: Node and Bun
  runs of the TS reference can differ where readdir order changes it.
- **Inherited property order.** `GetPropertiesOfType` on an interface that
  extends another lists inherited members first; TS lists own members first.
  `coreTypeProperties` is therefore sorted on both sides. Its only consumer
  uses `.includes`.
- **`#imports` resolution.** tsgo resolves package.json `#imports` subpaths
  with `.js`→`.ts` substitution; TS 6 does not. Go therefore sweeps generated
  files that TS never loads:
  - templates/functions: 79 vs 77 project files (`.pikku/agent/pikku-agent-types.gen.ts`, `.pikku/services/pikku-meta-service.gen.ts`)
  - online-shop: 160 vs 151

  So far this has added no state. Watch for it when porting a group that
  matches generated code.
- **JSON.** Go's encoder escapes `<>&` and U+2028/9 and formats numbers
  differently from `JSON.stringify`. Integer-like keys of a JS object come
  first in ascending order. `internal/jsjson` and `state.Record` reproduce
  both. Never use `encoding/json` to write state.

## typesLookup → serviceTypes

TS state carries `typesLookup: Map<string, ts.Type[]>`, which cannot be
serialized. Nothing outside the TypeScript engine reads it any more: finalize's
`extractAllServices` and the CLI's workflow codegen read the serialized
`serviceTypes` (`singletonServices`, `services`), which both engines emit.
The CLI only clears `typesLookup` after a TypeScript-engine inspection to
release memory. Go's state still has a `coreTypeProperties` field (the core
types' property names, sorted), used by `bench/`; finalize and the CLI do not
read it.

## Schema generation

`schemas.GenerateAll` ports `schema-generator.ts`:
- **Program.** It builds a second program with the project's full tsconfig
  options, rooted at a virtual `__pikku_virtual_types__.ts` that is served from
  memory and imports every type to generate. That program shares the
  inspector's `program.Cache`, so the project's files are not re-parsed.
- **Type lookups.** Named-type lookups are indexed once per generator.
- **Schema names, in order:**
  1. custom types
  2. function input/output unique names
  3. `schemasFromTypes`

  Primitives are skipped.
- **Zod first.** Vendor (Zod) schemas from `schemaLookup` are converted first,
  through `VendorSchemaConverter`. The default `NodeConverter` runs
  `vendorScript` (scripts/vendor-schemas.mjs). That script imports the schema
  modules through tsx and replays the Zod branch of `schema-generator.ts`,
  using helpers from `packages/inspector/dist`.
- **Missing converter.** No converter with a non-empty `schemaLookup` is an
  error, not a silent skip.
- **Disk cache.** When `cacheDir` is set, the TS schemas are cached in
  `<cacheDir>/go-ts-schemas.json` (internal/schemas/cache.go). This is a separate
  file from the TS engine's `ts-schemas.json`, because the two engines' output
  is not byte-identical. The key is a sha1 of the engine binary, the generator
  options, the names to generate and the custom-types source. Dependencies are
  checked by mtime and size, as in TS. Read and write failures are logged at
  debug level only. The same-process in-memory fast path is not ported.
- **Not ported.** The http `inputTypes` loop: that field is always undefined.

Parity against TS: online-shop 235/235 keys (230 byte-equal), functions 96/96
(95 byte-equal). The byte differences are:
- `definitions` key order (vega sorts)
- `additionalProperties` placement
- some vega error wording

Timing for the TS-type part:

| project | TS | Go cold | Go warm |
|---|---|---|---|
| online-shop | 510 ms | 107 ms | 71 ms |
| functions | 238 ms | 179 ms | 126 ms |

In schemas mode, the Node Zod converter (545–672 ms on online-shop) dominates
Go's wall time.

**Open decision:** ship `vendor-schemas.mjs` with the package, or export the
Zod conversion from `@pikku/inspector` and have the wrapper do it.

## Status

Everything is ported: every visitor group, the secret- and surface-usage
sweeps, `validateWebhookSourceTriggers`, schema generation, finalize
(post-process, contract hashes, manifest, workflow finalize, OpenAPI) and the
standalone helpers (`collectSurface`, `readJsxLiteralText`,
`readModuleSpecifiers`, `readTsconfigOutDir`, `scanFrontend`, `scanHooks`).
Both engines produce byte-identical `pikku all` output on every template and
example, and the parity harness passes `--strict` on them. The Go goldens in
`testdata/*/inspect.golden.json` pin the fixtures.

### Known differences

- **Surface doc union order.** `collectSurface` prints some unions in a
  different member order from TypeScript (about 31 of 9488 lines of the core
  surface doc). TypeScript's own order is not stable either: it follows type
  creation order, which follows file load order, so Node and Bun runs of the
  TS engine already disagree. `internal/surface/print.go` could reuse
  `tsutil.TypeToStringAt` / `tsutil.UnionTypesInIdOrder`, but only matches if
  its sweep makes the same checker calls in the same order.
- **Throws become errors.** Where the TS visitors throw and abort the whole
  inspection, Go logs an error with the same message and carries on:
  - CLI: multiple default commands, invalid choices, a bad parameters
    pattern, `ref()` without a string literal, an unknown addon namespace;
  - workflow graphs: non-literal node or config values (`name`, `mode`,
    `notes`, rpc names). Go skips the value instead.
- **Channel connect/disconnect without function meta.** TS writes a partial
  `FunctionMeta`; `state.FunctionMeta` cannot express that shape. It cannot
  happen in practice, because addFunctions registers those functions first.
- **`readRequiredParentServices`** reads the generated file with a regex, so
  it only understands the JSON-at-line-start form codegen writes. TS imports
  the module.
- **`scanHooks`** has no `fromClient` parameter; `scanFrontend` does the
  client import check itself.
- **Recursive types in OpenAPI.** A route output with a recursive type fails
  in both engines. TS fails when the spec is serialized; Go fails earlier, in
  `generateOpenAPISpec`.

## typescript-go pin

typescript-go is pinned to exactly
`github.com/microsoft/typescript-go v0.0.0-20260708042240-2bd066d87f5b`. The pin
appears in `go.mod` (indirect) and in every `shim/*/go.mod`. There is no
auto-bump: no Renovate or Dependabot rule may touch it. tsgo has no stable Go
API; internals change shape between commits, and a printer or checker change
silently moves parity.

Bump procedure (one PR, nothing else in it):

1. Pick a commit and set it in every `shim/*/go.mod` and the root `go.mod`:

   ```sh
   for m in go.mod shim/*/go.mod shim/vfs/*/go.mod; do (cd $(dirname $m) && go get github.com/microsoft/typescript-go@<commit>); done
   ```

2. Regenerate the shims with `go run ./tools/gen_shims` from
   `packages/inspector-go`. Add any newly needed unexported members to the
   package's `extra-shim.json`.
3. `go mod tidy && go build ./... && go vet ./... && go test ./...`.
4. Run the full parity commands on both projects. The summary must be
   unchanged.
5. Re-run `bench/bench.sh` and note the timing in the PR.
6. Update the pin in this file and `PINNED` in `scripts/check-tsgo-pin.sh`.

`scripts/check-tsgo-pin.sh` (the `Go (inspector-go)` CI job) enforces this: it
fails when `go.mod` resolves another typescript-go, when a `shim/*/go.mod`
names another version, when `go mod verify` fails, or when re-running
`tools/gen_shims` changes `shim/`.

## Distribution

The binary ships esbuild style. `npm/<platform>-<arch>/` holds one package per
target, `@pikku/inspector-go-<platform>-<arch>`, with `os`/`cpu` set and only
`bin/pikku-inspect[.exe]` in it. `@pikku/inspector-go` lists them as exact
`optionalDependencies`, so a package manager installs the one matching the
host, and `src/binary.ts` resolves it. They are in a changesets `fixed` group
with `@pikku/inspector-go`, so every release bumps all six together.

- `node scripts/build-go.mjs` builds `bin/` for the host (local development).
- `node scripts/build-go.mjs --all` (or `--target linux-x64`) is the release
  build: `CGO_ENABLED=0 -trimpath -ldflags "-s -w"` into `npm/*/bin/`. The
  Publish workflow runs it before `changeset publish`.
- `node scripts/check-platform-binary.mjs` is each platform package's
  `prepublishOnly`: no binary, a truncated one, a wrong os/arch or a
  dynamically linked ELF refuses the publish.

The targets are listed in `scripts/platforms.mjs` and again in
`src/binary.ts`; `binary.test.ts` fails if those, `npm/` and
`optionalDependencies` disagree. There are no musl packages: the static linux
binaries run on Alpine as they are.
