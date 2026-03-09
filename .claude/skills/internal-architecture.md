# Pikku Internal Architecture

## Function Registration & Resolution

### How functions are registered

Functions are registered via `addFunction(funcName, funcConfig, packageName?)` from `@pikku/core`.

- **Project functions** are registered with `packageName = null`:
  ```ts
  addFunction('healthCheck', healthCheck)
  ```
- **Addon functions** are registered with their npm package name:
  ```ts
  addFunction('findPetsByStatus', findPetsByStatus, '@pikku/addon-swagger-petstore')
  ```

Functions are stored in `pikkuState(packageName, 'function', 'functions')` — a Map keyed by the **bare function name** (no namespace prefix), namespaced by `packageName`.

### How functions are looked up at runtime

`runPikkuFunc()` looks up functions via:
```ts
pikkuState(packageName, 'function', 'functions').get(funcName)
```

The `funcName` must be the **bare name** (e.g. `findPetsByStatus`), and `packageName` must be the npm package (e.g. `@pikku/addon-swagger-petstore`). If either is wrong, you get `Function not found`.

### The `pikkuFuncId` in generated metadata

The inspector generates metadata JSON files (e.g. `pikku-cli-wirings-meta.gen.json`, `pikku-channels-meta.gen.json`) that contain `pikkuFuncId` fields. These should be the **bare function name** when `packageName` is also present in the metadata. The `packageName` field tells the runtime which package namespace to look up the function in.

**Correct meta:**
```json
{ "pikkuFuncId": "findPetsByStatus", "packageName": "@pikku/addon-swagger-petstore" }
```

**Wrong (would cause Function not found):**
```json
{ "pikkuFuncId": "swaggerPetstore:findPetsByStatus", "packageName": "@pikku/addon-swagger-petstore" }
```

### Addon namespace vs package name

- **Addon namespace** (e.g. `swaggerPetstore`) — the camelCase alias declared via `wireAddon({ name: 'swaggerPetstore', package: '@pikku/addon-swagger-petstore' })`. Used in source code with `addon('swaggerPetstore:findPetsByStatus')`.
- **Package name** (e.g. `@pikku/addon-swagger-petstore`) — the npm package name. Used for `pikkuState` namespacing and function registration.

The `addon()` helper (generated in `pikku-function-types.gen.ts`) creates a proxy that calls `rpc.invoke(rpcName, data)` — it does NOT directly call the function. It's used in CLI/channel wirings to reference addon functions.

## Bootstrap & Loading Order

### `pikku-bootstrap.gen.ts`

This is the entry point that loads all metadata and wirings. Import order matters:

1. **Meta files** — register metadata (function signatures, schemas, etc.)
2. **Wiring files** — register actual function implementations
3. **Addon bootstraps** — `import '@pikku/addon-foo/.pikku/pikku-bootstrap.gen.js'` loads the addon's own meta + functions

Each addon has its own `pikku-bootstrap.gen.ts` that registers its functions under its `packageName`.

### Generated file locations

For a project `my-project`:
```
backend/.pikku/
  pikku-bootstrap.gen.ts        # Main entry — imports everything
  pikku-types.gen.ts             # Re-exports all type files
  function/
    pikku-functions.gen.ts       # addFunction() calls for project functions
    pikku-functions-meta.gen.ts  # Function metadata (schemas, auth, etc.)
  cli/
    pikku-cli-wirings.gen.ts     # Imports CLI wiring files
    pikku-cli-wirings-meta.gen.json  # CLI command tree metadata
    cli-local.gen.ts             # Local CLI entry point
  channel/
    pikku-channels.gen.ts        # Channel wiring registrations
    pikku-channels-meta.gen.json # Channel route metadata
  rpc/
    pikku-rpc-wirings.gen.ts     # RPC endpoint registrations
  schemas/
    register.gen.ts              # JSON schema registrations
```

For an addon package `@pikku/addon-foo`:
```
packages/foo/.pikku/
  pikku-bootstrap.gen.ts         # Addon bootstrap
  function/
    pikku-functions.gen.ts       # addFunction() with packageName
    pikku-functions-meta.gen.ts  # Addon function metadata
  schemas/
    register.gen.ts              # Addon schemas
```

## CLI Architecture

### Local CLI (`cli-local.gen.ts`)
- Imports `pikku-bootstrap.gen.ts` (loads all meta + functions)
- Calls `executeCLI()` which parses args via `parseCLIArguments()`
- Runs the function via `runCLICommand()` → `runPikkuFunc()`

### WebSocket CLI (channel-based)
- Uses the channel wiring system
- CLI commands are registered as channel message routes
- The channel handler resolves functions from meta and calls `runPikkuFunc()`

### CLI data coercion
- CLI passes all values as strings
- `pluckCLIData()` in `cli-runner.ts` maps CLI options to function input schema
- When schema expects `type: "array"` and CLI provides a string, it should be split by comma (e.g. `--status sold` → `["sold"]`, `--status a,b` → `["a", "b"]`)

## Inspector

### Key files
- `packages/inspector/src/add/add-cli.ts` — Inspects `wireCLI()` calls, extracts command metadata
- `packages/inspector/src/add/add-channel.ts` — Inspects `wireChannel()` calls, extracts route metadata
- `packages/inspector/src/utils/extract-function-name.ts` — Resolves function names from AST nodes

### How addon functions are resolved in inspector
When the inspector encounters `addon('namespace:funcName')`:
1. Validates the namespace exists in `wireAddonDeclarations`
2. Resolves `packageName` from the declaration
3. Strips the namespace prefix and stores the bare `funcName` as `pikkuFuncId`
4. Stores `packageName` alongside it

## Wiring Types

| Wiring | Runner | Meta file |
|--------|--------|-----------|
| RPC | `runPikkuFunc` via HTTP | `pikku-rpc-wirings-meta.gen.json` |
| CLI | `executeCLI` → `runCLICommand` → `runPikkuFunc` | `pikku-cli-wirings-meta.gen.json` |
| Channel | channel handler → `runPikkuFunc` | `pikku-channels-meta.gen.json` |
| HTTP | `fetch` → route matching → `runPikkuFunc` | `pikku-http-wirings-meta.gen.json` |
| Agent | agent runner → tool calls → `runPikkuFunc` | `pikku-agent-wirings-meta.gen.json` |
| MCP | MCP server → tool calls → `runPikkuFunc` | `pikku-mcp-wirings-meta.gen.json` |
| Scheduler | cron/interval → `runPikkuFunc` | `pikku-schedulers-wirings-meta.gen.json` |
| Queue | queue worker → `runPikkuFunc` | `pikku-queue-workers-wirings-meta.gen.json` |
