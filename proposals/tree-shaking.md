# Tree-shaking & Advanced Filtering Implementation Plan

## Overview

Implement comprehensive tree-shaking with enhanced filtering to ensure only required code and services are included in bundles. Verify with E2E bundle tests that execute the generated code.

---

## Final Filter Design

```typescript
type InspectorFilters = {
  names?: string[] // Wildcard support: "email-*", "user-*" (queue/channel/CLI/function names)
  tags?: string[] // Existing
  types?: string[] // Existing: http, channel, scheduler, queue, mcp, cli
  directories?: string[] // Existing
  httpRoutes?: string[] // New: "/api/*", "/webhooks/*" (wildcard prefix matching)
  httpMethods?: string[] // New: ["GET", "POST", "DELETE", "PATCH", "PUT", "HEAD", "OPTIONS"]
}
```

## CLI Interface

```bash
# Individual flags (AND'd together)
pikku prebuild --tags=admin --http-routes=/api/* --http-methods=GET,POST
pikku prebuild --names=email-*,notification-* --types=queue

# Complex OR filter (multiple filter groups)
pikku prebuild --filter='[
  {"tags": ["admin"], "httpRoutes": ["/api/*"]},
  {"httpRoutes": ["/webhooks/*"], "httpMethods": ["POST"]}
]'

# Precedence warning when both provided
pikku prebuild --tags=admin --filter='[...]'
# ⚠️  Warning: --filter takes precedence, ignoring --tags, --types, --directories, --names, --http-routes, --http-methods
```

---

## Phase 1: Inspector - Enhanced Filtering

### 1.1 Update Filter Types

**File**: `packages/inspector/src/types.ts`

Add to `InspectorFilters`:

```typescript
export type InspectorFilters = {
  names?: string[] // NEW
  tags?: string[]
  types?: string[]
  directories?: string[]
  httpRoutes?: string[] // NEW
  httpMethods?: string[] // NEW
}
```

### 1.2 Update Filter Matching Logic

**File**: `packages/inspector/src/utils/filter-utils.ts`

**1. Add wildcard matching utility**:

```typescript
/**
 * Match a value against a pattern with wildcard support
 * Supports "*" suffix only (e.g., "email-*" matches "email-worker", "email-sender")
 * @param value - The value to check
 * @param pattern - The pattern with optional "*" suffix
 */
export function matchesWildcard(value: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1)
    return value.startsWith(prefix)
  }
  return value === pattern
}
```

**2. Update `matchesFilters()` signature and implementation**:

```typescript
export const matchesFilters = (
  filters: InspectorFilters,
  params: {
    tags?: string[]
    name?: string // NEW: wire/function name
  },
  meta: {
    type: PikkuWiringTypes
    name: string
    filePath?: string
    httpRoute?: string // NEW: for HTTP routes
    httpMethod?: string // NEW: for HTTP methods
  },
  logger: InspectorLogger
) => {
  // ... existing filter logic ...

  // NEW: Check name filter (with wildcard support)
  if (filters.names && filters.names.length > 0) {
    const nameMatches = filters.names.some((pattern) =>
      matchesWildcard(params.name || meta.name, pattern)
    )
    if (!nameMatches) {
      logger.debug(`⒡ Filtered by name: ${meta.type}:${meta.name}`)
      return false
    }
  }

  // NEW: Check HTTP route filter (with wildcard support)
  if (filters.httpRoutes && filters.httpRoutes.length > 0 && meta.httpRoute) {
    const routeMatches = filters.httpRoutes.some((pattern) =>
      matchesWildcard(meta.httpRoute!, pattern)
    )
    if (!routeMatches) {
      logger.debug(`⒡ Filtered by HTTP route: ${meta.httpRoute}`)
      return false
    }
  }

  // NEW: Check HTTP method filter
  if (
    filters.httpMethods &&
    filters.httpMethods.length > 0 &&
    meta.httpMethod
  ) {
    if (!filters.httpMethods.includes(meta.httpMethod.toUpperCase())) {
      logger.debug(`⒡ Filtered by HTTP method: ${meta.httpMethod}`)
      return false
    }
  }

  return true
}
```

**3. Add unit tests**:

```typescript
// filter-utils.test.ts
describe('matchesWildcard', () => {
  test('exact match', () => {
    assert(matchesWildcard('email-worker', 'email-worker'))
  })

  test('wildcard prefix match', () => {
    assert(matchesWildcard('email-worker', 'email-*'))
    assert(matchesWildcard('email-sender', 'email-*'))
  })

  test('wildcard no match', () => {
    assert(!matchesWildcard('notification-worker', 'email-*'))
  })
})

describe('matchesFilters', () => {
  test('filters by name with wildcard', () => {
    /* ... */
  })
  test('filters by HTTP route prefix', () => {
    /* ... */
  })
  test('filters by HTTP method', () => {
    /* ... */
  })
  test('combines multiple filters with AND', () => {
    /* ... */
  })
})
```

### 1.3 Update Wire Addition to Pass New Filter Data

**Files**: All `packages/inspector/src/add/add-*.ts` files

**`add-http-route.ts`**:

```typescript
if (
  !matchesFilters(
    options.filters || {},
    { tags, name: funcName }, // Add name
    {
      type: PikkuWiringTypes.http,
      name: route,
      filePath,
      httpRoute: route, // NEW
      httpMethod: method, // NEW
    },
    logger
  )
) {
  return
}
```

**`add-channel.ts`**:

```typescript
if (
  !matchesFilters(
    options.filters || {},
    { tags, name: channelName }, // Add name
    { type: PikkuWiringTypes.channel, name: channelName, filePath },
    logger
  )
) {
  return
}
```

**`add-queue-worker.ts`**:

```typescript
if (
  !matchesFilters(
    options.filters || {},
    { tags, name: queueName }, // Add name
    { type: PikkuWiringTypes.queue, name: queueName, filePath },
    logger
  )
) {
  return
}
```

**Similar updates for**: `add-schedule.ts`, `add-mcp-*.ts`, `add-cli.ts`

### 1.4 Add Service Aggregation Tracking

**File**: `packages/inspector/src/types.ts`

Add to `InspectorState`:

```typescript
export interface InspectorState {
  // ... existing fields ...

  serviceAggregation: {
    requiredServices: Set<string> // All services needed across the app
    usedFunctions: Set<string> // Function names actually wired/exposed
    usedMiddleware: Set<string> // Middleware names used by wired functions
    usedPermissions: Set<string> // Permission names used by wired functions
  }
}
```

### 1.5 Create Post-Processing Module

**File**: `packages/inspector/src/post-process.ts` (NEW)

```typescript
import { InspectorState } from './types.js'
import { FunctionServicesMeta } from '@pikku/core'

/**
 * Aggregates all required services from wired functions, middleware, and permissions
 * Must be called after AST traversal completes
 */
export function aggregateRequiredServices(state: InspectorState): void {
  const { serviceAggregation } = state

  // Step 1: Find all used functions
  findUsedFunctions(state)

  // Step 2: For each used function, find middleware and permissions from meta
  findUsedMiddlewareAndPermissions(state)

  // Step 3: Aggregate services from all sources
  aggregateServicesFromAllSources(state)
}

function findUsedFunctions(state: InspectorState): void {
  const { usedFunctions } = state.serviceAggregation

  // HTTP wirings
  for (const [method, routes] of Object.entries(state.http.meta)) {
    for (const [route, meta] of Object.entries(routes)) {
      usedFunctions.add(meta.pikkuFuncName)
    }
  }

  // Channels
  for (const [name, meta] of Object.entries(state.channels.meta)) {
    usedFunctions.add(meta.pikkuFuncName)
  }

  // Schedulers
  for (const [name, meta] of Object.entries(state.scheduledTasks.meta)) {
    usedFunctions.add(meta.pikkuFuncName)
  }

  // Queue workers
  for (const [name, meta] of Object.entries(state.queueWorkers.meta)) {
    usedFunctions.add(meta.pikkuFuncName)
  }

  // MCP endpoints
  for (const [name, meta] of Object.entries(state.mcpEndpoints.resourcesMeta)) {
    usedFunctions.add(meta.pikkuFuncName)
  }
  for (const [name, meta] of Object.entries(state.mcpEndpoints.toolsMeta)) {
    usedFunctions.add(meta.pikkuFuncName)
  }
  for (const [name, meta] of Object.entries(state.mcpEndpoints.promptsMeta)) {
    usedFunctions.add(meta.pikkuFuncName)
  }

  // CLI commands
  for (const [name, meta] of Object.entries(state.cli.meta)) {
    usedFunctions.add(meta.pikkuFuncName)
  }

  // RPC exposed functions
  for (const [name, funcName] of Object.entries(state.rpc.exposedMeta)) {
    usedFunctions.add(funcName)
  }
}

function findUsedMiddlewareAndPermissions(state: InspectorState): void {
  const { usedMiddleware, usedPermissions } = state.serviceAggregation

  // Helper to extract middleware/permission names from meta
  const extractNames = (list?: Array<{ name: string }>) =>
    list?.map((item) => item.name) || []

  // HTTP wirings
  for (const [method, routes] of Object.entries(state.http.meta)) {
    for (const [route, meta] of Object.entries(routes)) {
      extractNames(meta.middleware).forEach((name) => usedMiddleware.add(name))
      extractNames(meta.permissions).forEach((name) =>
        usedPermissions.add(name)
      )
    }
  }

  // Similar for channels, schedulers, queues, MCP, CLI...
  // (Each wiring type has middleware and permissions in their meta)
}

function aggregateServicesFromAllSources(state: InspectorState): void {
  const { requiredServices, usedFunctions, usedMiddleware, usedPermissions } =
    state.serviceAggregation

  // Internal services (always excluded)
  const internalServices = new Set(['rpc', 'mcp', 'channel', 'userSession'])

  const addServices = (services: FunctionServicesMeta | undefined) => {
    if (!services || !services.services) return
    services.services.forEach((service) => {
      if (!internalServices.has(service)) {
        requiredServices.add(service)
      }
    })
  }

  // 1. Services from used functions
  usedFunctions.forEach((funcName) => {
    const funcMeta = state.functions.meta[funcName]
    if (funcMeta?.services) {
      addServices(funcMeta.services)
    }
  })

  // 2. Services from used middleware
  usedMiddleware.forEach((middlewareName) => {
    const middlewareMeta = state.middleware.meta[middlewareName]
    if (middlewareMeta?.services) {
      addServices(middlewareMeta.services)
    }
  })

  // 3. Services from used permissions
  usedPermissions.forEach((permissionName) => {
    const permissionMeta = state.permissions.meta[permissionName]
    if (permissionMeta?.services) {
      addServices(permissionMeta.services)
    }
  })

  // 4. Services from session service factories
  for (const [factoryName, singletonServices] of state.sessionServicesMeta) {
    singletonServices.forEach((service) => {
      if (!internalServices.has(service)) {
        requiredServices.add(service)
      }
    })
  }
}
```

### 1.6 Update Inspector Main

**File**: `packages/inspector/src/inspector.ts`

```typescript
import { aggregateRequiredServices } from './post-process.js'

export async function inspect(...): Promise<InspectorState> {
  // ... existing inspection logic ...

  // NEW: Post-processing after AST traversal
  aggregateRequiredServices(state)

  return state
}
```

Initialize `serviceAggregation` when creating state:

```typescript
const state: InspectorState = {
  // ... existing fields ...
  serviceAggregation: {
    requiredServices: new Set(),
    usedFunctions: new Set(),
    usedMiddleware: new Set(),
    usedPermissions: new Set(),
  },
}
```

---

## Phase 2: CLI - Argument Parsing

### 2.1 Update CLI Config Type

**File**: `packages/cli/types/config.d.ts`

Update to support new filters (already has `filters: InspectorFilters`):

```typescript
export type PikkuCLIConfig = {
  // ... existing fields ...
  filters: InspectorFilters // Already exists, types updated in Phase 1.1
} & PikkuCLICoreOutputFiles
```

### 2.2 Add CLI Argument Parser

**File**: `packages/cli/src/utils/parse-cli-args.ts` (NEW)

```typescript
import { InspectorFilters } from '@pikku/inspector'
import { CLILogger } from '../services/cli-logger.service.js'

export interface ParsedCLIArgs {
  filters: InspectorFilters | InspectorFilters[]
  configFile?: string
}

/**
 * Parse CLI arguments and build filters
 * Supports both individual flags and --filter JSON
 */
export function parseCLIArgs(args: string[], logger: CLILogger): ParsedCLIArgs {
  const parsedArgs: Record<string, string> = {}

  // Parse arguments
  for (const arg of args) {
    const [key, value] = arg.split('=')
    if (key.startsWith('--')) {
      parsedArgs[key.slice(2)] = value
    }
  }

  // Check for --filter (takes precedence)
  if (parsedArgs.filter) {
    const individualFlagsProvided = [
      'tags',
      'types',
      'directories',
      'names',
      'http-routes',
      'http-methods',
    ].some((flag) => parsedArgs[flag])

    if (individualFlagsProvided) {
      logger.warn(
        '⚠️  Warning: --filter takes precedence. Ignoring --tags, --types, --directories, --names, --http-routes, --http-methods'
      )
    }

    try {
      const filters = JSON.parse(parsedArgs.filter)
      return { filters, configFile: parsedArgs.config }
    } catch (error) {
      throw new Error(`Failed to parse --filter JSON: ${error.message}`)
    }
  }

  // Build single filter from individual flags
  const filters: InspectorFilters = {}

  if (parsedArgs.tags) {
    filters.tags = parsedArgs.tags.split(',').map((s) => s.trim())
  }
  if (parsedArgs.types) {
    filters.types = parsedArgs.types.split(',').map((s) => s.trim())
  }
  if (parsedArgs.directories) {
    filters.directories = parsedArgs.directories.split(',').map((s) => s.trim())
  }
  if (parsedArgs.names) {
    filters.names = parsedArgs.names.split(',').map((s) => s.trim())
  }
  if (parsedArgs['http-routes']) {
    filters.httpRoutes = parsedArgs['http-routes']
      .split(',')
      .map((s) => s.trim())
  }
  if (parsedArgs['http-methods']) {
    filters.httpMethods = parsedArgs['http-methods']
      .split(',')
      .map((s) => s.trim().toUpperCase())
  }

  return { filters, configFile: parsedArgs.config }
}
```

### 2.3 Update CLI Commands to Use Parsed Args

**File**: `packages/cli/src/functions/commands/all.ts`

Update CLI commands to accept and use parsed filters:

```typescript
import { parseCLIArgs } from '../../utils/parse-cli-args.js'

export const pikkuPrebuild = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const { filters } = parseCLIArgs(process.argv, logger)

    // Merge with config filters (CLI args override config)
    const finalFilters = Array.isArray(filters)
      ? filters
      : { ...config.filters, ...filters }

    // Use finalFilters in inspector
    const state = await inspect(/* ... */, { filters: finalFilters })

    // ... rest of prebuild logic
  }
})
```

---

## Phase 3: CLI - Service Generation Enhancement

### 3.1 Update Service Serialization

**File**: `packages/cli/src/functions/wirings/functions/pikku-command-services.ts`

Update `serializeServicesMap()` to use aggregated services:

```typescript
export const serializeServicesMap = (
  requiredServices: Set<string>, // NEW: from inspector aggregation
  forceRequiredServices: string[] = [],
  servicesImport: string,
  sessionServicesImport: string
): string => {
  // Combine aggregated + forced services
  const allServices = new Set([...requiredServices, ...forceRequiredServices])

  // Internal services excluded
  const internalServices = new Set(['rpc', 'mcp', 'channel', 'userSession'])

  const usedServices = Array.from(allServices).filter(
    (service) => !internalServices.has(service)
  )

  // Create services map
  const servicesMap = Object.fromEntries(
    usedServices.sort().map((service) => [service, true])
  )

  // Default framework services
  const defaultServices = ['config', 'logger', 'variables', 'schema']

  const allRequiredServices = [
    ...new Set([...defaultServices, ...usedServices]),
  ].sort()

  const code = [
    servicesImport,
    sessionServicesImport,
    "import type { PikkuInteraction } from '@pikku/core'",
    '',
    'export const singletonServices = {',
    ...Object.keys(servicesMap).map((service) => `    '${service}': true,`),
    '} as const',
    '',
    '// Singleton services (created once at startup)',
    '// Only includes services that are both required and available in SingletonServices',
    `export type RequiredSingletonServices = Pick<SingletonServices, Extract<keyof SingletonServices, ${allRequiredServices.map((k) => `'${k}'`).join(' | ')}>> & Partial<Omit<SingletonServices, ${allRequiredServices.map((k) => `'${k}'`).join(' | ')}>>`,
    '',
    '// Session services (created per request, can access singleton services)',
    '// Omits singleton services and PikkuInteraction (mcp, rpc, http, channel)',
    `export type RequiredSessionServices = Omit<Services, keyof SingletonServices | keyof PikkuInteraction>`,
    '',
  ].join('\n')

  return code
}
```

### 3.2 Update pikkuServices Command

**File**: Same as above

```typescript
export const pikkuServices: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()

    // ... existing checks ...

    // NEW: Use aggregated services from inspector
    const requiredServices = visitState.serviceAggregation.requiredServices

    const servicesCode = serializeServicesMap(
      requiredServices, // Use aggregated services!
      config.forceRequiredServices,
      servicesImport,
      sessionServicesImport
    )

    await writeFileInDir(logger, config.servicesFile, servicesCode)
  },
  // ... middleware ...
})
```

---

## Phase 4: Post-Inspection Filtering (Optional Future Enhancement)

This phase can be implemented later if needed to completely remove filtered items from generated files.

**Concept**: After inspection, remove unused middleware/permissions/functions from state before code generation.

**Location**: `packages/cli/src/utils/final-filter.ts`

**Deferred for now** - current filtering at wire-addition time should be sufficient.

---

## Phase 5: Tree-shaking Verifier Tests

### 5.1 Project Structure

**Location**: `verifiers/treeshaking/`

```
verifiers/treeshaking/
├── package.json
├── tsconfig.json
├── esbuild.config.js
├── configs/
│   ├── base.json
│   ├── filter-by-tag.json
│   ├── filter-by-http-route.json
│   ├── filter-by-http-method.json
│   ├── filter-by-name.json
│   ├── filter-by-type.json
│   └── filter-complex-or.json
├── src/
│   ├── index.ts
│   ├── services/
│   │   ├── small-service.ts          (~1KB)
│   │   ├── medium-service.ts         (~10KB)
│   │   ├── large-service.ts          (~50KB)
│   │   └── services.ts (exports)
│   ├── functions/
│   │   ├── admin-function.ts         (uses large-service, tag: admin)
│   │   ├── public-function.ts        (uses small-service, tag: public)
│   │   ├── email-worker.ts           (uses medium-service, name: email-*)
│   │   └── notification-worker.ts    (uses large-service, name: notification-*)
│   ├── middleware/
│   │   ├── auth-middleware.ts        (uses medium-service)
│   │   └── logging-middleware.ts     (uses small-service)
│   ├── permissions/
│   │   ├── admin-permission.ts       (uses large-service)
│   │   └── public-permission.ts      (uses small-service)
│   ├── wirings/
│   │   ├── http.wiring.ts
│   │   ├── queue.wiring.ts
│   │   └── scheduler.wiring.ts
│   └── types/
│       └── application-types.d.ts
└── tests/
    ├── run-tests.ts
    ├── bundle-utils.ts
    ├── assertions.ts
    └── test-configs.ts
```

### 5.2 Package.json

```json
{
  "name": "@pikku/verify-treeshaking",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "npx tsx tests/run-tests.ts",
    "pikku": "pikku"
  },
  "dependencies": {
    "@pikku/core": "workspace:*"
  },
  "devDependencies": {
    "@pikku/cli": "workspace:*",
    "@types/node": "^24",
    "esbuild": "^0.24",
    "tsx": "^4",
    "typescript": "^5.6"
  }
}
```

### 5.3 Test Implementation Details

See full implementation details in the main plan document sections 5.3-5.9.

Key testing approach:

1. Run `pikku prebuild` with different filter configs
2. Bundle with esbuild (NO minification)
3. Regex verify bundle contents
4. Execute bundle to ensure it works
5. Optional smoke tests for specific functionality

---

## Implementation Order

1. **Phase 1.1-1.3**: Filter enhancements (2-3 hours)

   - Update types
   - Add wildcard matching
   - Update wire additions
   - Unit tests

2. **Phase 2**: CLI argument parsing (1-2 hours)

   - Parse CLI args
   - Precedence warning
   - Integration with config

3. **Phase 1.4-1.6**: Service aggregation (3-4 hours)

   - Add tracking to state
   - Implement post-processing
   - Update inspector

4. **Phase 3**: Service generation (1-2 hours)

   - Update serializeServicesMap
   - Use aggregated services

5. **Phase 5**: Verifier tests (4-6 hours)
   - Setup project structure
   - Create test services
   - Write test configs
   - Implement test runner
   - Verify all scenarios

**Total Estimate**: 11-17 hours

---

## Success Criteria

- ✅ New filters work: `names`, `httpRoutes`, `httpMethods`
- ✅ Wildcard matching: `email-*`, `/api/*`
- ✅ CLI flags: `--tags`, `--names`, `--http-routes`, `--http-methods`
- ✅ `--filter` JSON with OR logic
- ✅ Precedence warning when both `--filter` and flags provided
- ✅ Service aggregation from functions, middleware, permissions, session factories
- ✅ `RequiredSingletonServices` only includes used services
- ✅ All verifier tests pass (bundle + execute)
- ✅ Filtered bundles don't include unused code
- ✅ Existing verifiers still pass
