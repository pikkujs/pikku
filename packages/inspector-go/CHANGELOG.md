# @pikku/inspector-go

## 0.12.1

### Patch Changes

- 8bd70db: Printed unions now list their members alphabetically, with `null` and `undefined` last, in both inspectors. A union's order used to follow which file the type checker reached first, so it could differ between Node and Bun, and between the TypeScript and native inspectors, and with it the generated schema's `enum` and the function's contract hash. CLI `choices` taken from a union of string literals are sorted the same way; an `enum` keeps its declaration order.

  The first codegen after upgrading reorders those unions once. A function whose input or output is an inline union that was not already in this order gets a new contract hash, so a `versions.pikku.json` that recorded the old one reports it as modified.

- ffb53f2: The CLI can inspect with a native engine: the `pikku-inspect` binary from `@pikku/inspector-go`, built on typescript-go (TypeScript 7). It is the default, and generates output identical to the TypeScript inspector (`@pikku/inspector`, TypeScript 6 compiler API). Choose the TypeScript one with `"inspector": "typescript"` in `pikku.config.json`, `--inspector typescript`, or `PIKKU_INSPECTOR=typescript`. The flag beats the environment variable, which beats the config key. Any other value is rejected, including the old `PIKKU_INSPECTOR=go`; use `native`.

  When no engine is chosen and no `pikku-inspect` binary exists for the platform, the CLI warns and uses the TypeScript engine. An explicit `native` with no binary stops with an error that names the TypeScript engine. The codegen child that `pikku dev` and watch mode start inherits the parent's engine.

- 8325c75: The native inspector identifies pikku helpers by what their callee resolves to, as the TypeScript inspector does, so `import { addTagMiddleware as guard }` and `mw.addTagMiddleware(...)` register their middleware (and aliased `pikkuFunc`, `pikkuPermission`, `pikkuBetterAuth` calls are seen). A channel's unexported `onConnect`/`onDisconnect` handler gets its function metadata, so its contract is recorded.

  A middleware or permission helper passed around as a value is reported as PKU577, as in the TypeScript inspector, rather than generating an app whose gate never runs.

  A CLI option's choices derived from a string-literal union come out in the TypeScript inspector's order (type-id order) instead of typescript-go's value order.

- 10f98d3: The package description no longer calls the native engine opt-in; it is the CLI's default.
- ffc0fa4: Port the shared finalize pass (post-processing, HTTP route auth, and the exposed-gate, tag-middleware and single-step-workflow validators) to Go behind `pikku-inspect inspect --stdin --finalize`; the protocol carries the validation-pass bracket, which the wrapper replays.
- 832eda5: Ship `pikku-inspect` prebuilt inside `@pikku/inspector-go`: the static binaries for darwin-arm64, darwin-x64, linux-x64, linux-arm64 and win32-x64 sit under `prebuilt/<platform>-<arch>/`, and the host's is picked at runtime. There are no per-platform packages or optional dependencies, so a lockfile from any platform installs it everywhere. A missing binary fails with the platform and `PIKKU_INSPECTOR_GO_BIN` named.
- bdb67e5: `pikku-inspect` frees the analysis program before generating schemas, so its peak memory no longer includes the analysis checker, the schema program and the Zod conversion process at once. On a mid-sized app the binary's peak fell from about 460 MB to about 270 MB, and to about 60 MB while Zod schemas convert. Output is unchanged.
- 6bdfd67: The Go inspector prints unions and mapped-type properties in the same order as the TypeScript inspector, so schema `enum` and `required` arrays, and the contract hashes built from them, match.
- ef17c47: Split `inspect()` into `analyzeProgram()` (engine-specific, needs the checker) and `finalizeInspectorState()` (shared, checker-free, served typescript-free from `@pikku/inspector/finalize`). The serialized inspector state now carries every field finalize reads, so a state produced by another engine can be finalized identically.

  Add `@pikku/inspector-go`, which runs analysis in the `pikku-inspect` binary over the `--stdin` JSON protocol and finalizes the result, plus a parity harness that diffs it against the TypeScript inspector. The CLI chooses between the two engines as described in the inspector-engine changeset.

- b9df997: The native inspector converts Zod schemas to JSON Schema without Node: `pikku-inspect` bundles the modules that declare them with the project's own zod and runs the conversion in an embedded QuickJS. A schema built from a value imported from a package, or declared in a module that only loads under Node, is converted by Node when it is on the PATH and is otherwise an error naming the package. `pikku-inspect` is also found beside a compiled `pikku`, and the Homebrew cask installs it there. `PIKKU_INSPECTOR_ZOD=node` sends every schema to Node.
- 94676e4: The native inspector records `addGlobalPermission` registrations in `permissions.global` the way `@pikku/inspector` does (#2148): inline permissions are named after where they sit, a const or imported argument is followed to its literal, an exported zero-argument factory is recorded by name, and a call nothing runs is warned about rather than recorded. What global permissions and global middleware use counts toward `requiredServices`.
- 6a16989: The native inspector mounts the routes of `refHTTP('ns:contract')` (optionally with `{ basePath }`) from the addon's published HTTP contracts, as `@pikku/inspector` does; before, an app wiring an addon's routes this way got no routes from native codegen. Addon MCP tools are written with the TypeScript inspector's key order, so `pikku-mcp-wirings-meta.gen.json` is byte-identical between the engines.
- Updated dependencies [3a9c9d8]
- Updated dependencies [dc952a8]
- Updated dependencies [7e44a0c]
- Updated dependencies [8bd70db]
- Updated dependencies [6a9488c]
- Updated dependencies [46e2c7e]
- Updated dependencies [a0ae9bb]
- Updated dependencies [8ec91f0]
- Updated dependencies [ffbe1a2]
- Updated dependencies [9999ec1]
- Updated dependencies [228faad]
- Updated dependencies [84de1eb]
- Updated dependencies [e659614]
- Updated dependencies [6c79f8d]
- Updated dependencies [fa308d4]
- Updated dependencies [802076e]
- Updated dependencies [1112955]
- Updated dependencies [0a4676a]
- Updated dependencies [674af8a]
- Updated dependencies [135811c]
- Updated dependencies [a8eb397]
- Updated dependencies [ef17c47]
- Updated dependencies [6d8a949]
- Updated dependencies [927210d]
- Updated dependencies [a88391a]
- Updated dependencies [3df9013]
  - @pikku/core@0.12.144
  - @pikku/inspector@0.12.107
