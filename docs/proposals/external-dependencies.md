# Proposal: External Package Dependencies with Namespace Isolation

**Status**: Draft
**Date**: 2025-01-19
**Author**: Pikku Team

## Overview

This proposal outlines a design for supporting external package dependencies in Pikku, allowing packages to import and reuse functions, wirings, and other Pikku entities from other packages while maintaining clean namespace isolation.

## Problem Statement

Currently, Pikku operates on a single package's codebase. Teams often need to:
- Share common functions across multiple services
- Reuse wirings and infrastructure across projects
- Build libraries of Pikku functions that can be consumed by multiple applications

Without a proper import mechanism, teams must either:
- Duplicate code across projects
- Use complex monorepo setups
- Manually manage shared code outside Pikku's inspection system

## Goals

1. Enable packages to import Pikku entities from external packages (via npm/node_modules)
2. Prevent naming collisions between local and imported entities
3. Support tree-shaking and filtering of imported entities
4. Maintain type safety across package boundaries
5. Keep the implementation simple and maintainable

## Proposed Solution

### Core Architecture: Namespace-First State Structure

**Current**: `PikkuState[Type][Content]`
**Proposed**: `PikkuState[Namespace][Type][Content]`

Each package gets a unique UUID namespace. The consuming package applies a logical name mapping to make references developer-friendly.

### Example

**Package A** (`@org/shared-functions`):
```json
// pikku.config.json
{
  "namespace": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Package B** (consumer):
```json
// pikku.config.json
{
  "namespace": "abc12345-e29b-41d4-a716-446655440000",
  "externalPackages": {
    "@org/shared-functions": {
      "namespace": "shared",
      "httpPrefix": "/api/v1/shared",
      "mcpPrefix": "/shared"
    }
  }
}
```

**Runtime State**:
```typescript
PikkuState = {
  "550e8400-e29b-41d4-a716-446655440000": { // @org/shared-functions
    "functions": { "sendEmail": {...} },
    "http": {...}
  },
  "abc12345-e29b-41d4-a716-446655440000": { // Package B (local)
    "functions": { "processOrder": {...} },
    "http": {...}
  }
}

// Logical mapping
namespaceMap = {
  "shared": "550e8400-e29b-41d4-a716-446655440000",
  "local": "abc12345-e29b-41d4-a716-446655440000"
}
```

**User Code** references functions as:
```typescript
// Reference imported function
pikkuState('shared:sendEmail', 'functions', ...)

// Reference local function
pikkuState('local:processOrder', 'functions', ...)
```

## Detailed Design

### 1. Configuration Schema

**New Fields**:
- `namespace` (string, UUID): Auto-generated unique identifier for this package
- `externalPackages` (object): Map of package imports with configuration

```json
{
  "namespace": "550e8400-e29b-41d4-a716-446655440000",
  "externalPackages": {
    "@org/shared": {
      "namespace": "shared",
      "httpPrefix": "/api/v1/shared",
      "mcpPrefix": "/shared"
    }
  }
}
```

**Behavior**:
- CLI auto-generates `namespace` UUID on first build if missing
- `namespace` identifies logical name (e.g., "shared")
- Optional `httpPrefix` and `mcpPrefix` for route prefixing

### 2. PikkuState Restructuring

Update state structure to include namespace as top level:

```typescript
interface PikkuState {
  [namespace: string]: {
    functions: FunctionsMeta
    http: HTTPWiringsMeta
    channels: ChannelsMeta
    // ... other transports
  }
}
```

Update `pikkuState()` helper:
```typescript
export const pikkuState = <Type, Content>(
  namespace: string,
  type: Type,
  content: Content,
  value?: any
) => {
  // Parse namespace:name format
  const [ns, name] = namespace.includes(':')
    ? namespace.split(':')
    : ['local', namespace]

  // Try UUID directly
  if (globalThis.pikkuState[ns]) {
    return globalThis.pikkuState[ns][type][content]
  }

  // Fall back to logical name mapping
  const uuid = globalThis.namespaceMap?.[ns]
  if (uuid && globalThis.pikkuState[uuid]) {
    return globalThis.pikkuState[uuid][type][content]
  }

  throw new Error(`Namespace '${ns}' not found`)
}
```

### 3. External Package Resolution

**Process**:
1. Read `externalPackages` from consumer's config
2. For each external package:
   - Resolve path: `require.resolve('@org/shared/package.json')`
   - Read `@org/shared/pikku.config.json`
   - Extract `namespace` UUID
   - **Error and bail** if config or UUID missing
3. Return mapping: `packageName → { uuid, path, config }`

**Error Handling**:
- Critical error if pikku.config.json doesn't exist
- Critical error if namespace field is missing
- Validation that UUID is valid UUID v4 format

### 4. Namespace Transformation

**Transform external package metadata** by prefixing with logical namespace:

#### Entities That Get Namespaced:
1. **Function names**: `sendEmail` → `shared:sendEmail`
2. **Tags**: `email` → `shared:email`
3. **Queue names**: `email-queue` → `shared:email-queue`
4. **Websocket channels**: `notifications` → `shared:notifications`
5. **Task names**: `process-order` → `shared:process-order`
6. **Workflow names**: `onboarding` → `shared:onboarding`
7. **HTTP routes**: Apply `httpPrefix`:
   - Original: `/users`
   - Transformed: `/api/v1/shared/users`
8. **MCP agents**: Apply `mcpPrefix` similarly
9. **Function references**: All `pikkuFuncName` fields in wirings

**Implementation**:
- Transformation happens automatically at import time
- Source package code doesn't change
- Consuming package controls the namespace prefix

### 5. Filtering with Namespace Support

**Colon notation** for namespace-aware filters:

```json
{
  "names": ["shared:send*", "local:process*"],
  "tags": ["shared:email", "util:format"],
  "types": ["http"],
  "httpRoutes": ["/api/v1/shared/*"]
}
```

**Filter Behavior**:
- Filters apply globally across ALL namespaces (merged view)
- Pattern matching understands `:` separator
- `shared:send*` matches functions starting with `send` in `shared` namespace
- `*:send*` matches `send*` in any namespace
- Wildcard `*` before `:` matches all namespaces

### 6. Code Generation

**Generated imports** for external packages:
```typescript
// .pikku/function/pikku-functions-meta.gen.ts
import { sendEmail } from '@org/shared/.pikku/function/pikku-functions-meta.gen.js'

export const functions = {
  'shared:sendEmail': sendEmail,
  'local:processOrder': processOrder
}
```

**Namespace mapping file**:
```typescript
// .pikku/namespace-map.gen.ts
export const namespaceMap = {
  "shared": "550e8400-e29b-41d4-a716-446655440000",
  "local": "abc12345-e29b-41d4-a716-446655440000"
}
```

**HTTP wirings with prefixed routes**:
```typescript
// .pikku/http/pikku-http-wirings.gen.ts
export const routes = {
  'POST /api/v1/shared/users': {
    pikkuFuncName: 'shared:createUser',
    route: '/api/v1/shared/users',
    method: 'POST'
  }
}
```

### 7. Type System Integration

- Extend `packageMappings` to include external packages
- Generate type imports from external packages:
  ```typescript
  import type { SendEmailInput } from '@org/shared/.pikku/types.gen.js'
  ```
- Namespace type references in generated metadata

## Implementation Plan

### Phase 1: Configuration Schema (Files: 2)
- `packages/cli/cli.schema.json`
- `packages/cli/src/utils/pikku-cli-config.ts`
- Add `namespace` and `externalPackages` fields
- Auto-generate UUID on first build

### Phase 2: PikkuState Restructuring (Files: ~20)
- `packages/core/src/pikku-state.ts`
- All inspector files that read/write state
- Update type definitions
- Update state accessors

### Phase 3: External Package Loading (Files: 2-3 new)
- `packages/cli/src/utils/resolve-external-packages.ts`
- `packages/cli/src/utils/load-external-packages.ts`
- Resolution logic
- Metadata loading

### Phase 4: Transformation Engine (Files: 1 new)
- `packages/cli/src/utils/transform-namespace.ts`
- Namespace prefixing logic
- HTTP/MCP route prefixing

### Phase 5: State Registration
- Integrate external package loading into build command
- Merge local + external states
- Generate namespace mapping

### Phase 6: Namespace-Aware Filtering
- `packages/inspector/src/utils/filter-inspector-state.ts`
- Support colon notation in filters
- Wildcard namespace matching

### Phase 7: Runtime Resolution
- Update `pikkuState()` helper with dual lookup
- Generate namespace mapping file

### Phase 8: Code Generation Updates
- Update all codegen to handle namespaced references
- Generate imports from external packages
- Update type imports

### Phase 9: Testing & Documentation
- Multi-package integration tests
- External package usage guide
- Migration guide

## Benefits

1. **Clean Isolation**: Each package in its own UUID namespace
2. **Zero Collisions**: UUID ensures no namespace conflicts
3. **Automatic Transformation**: Tags/names namespaced at import time
4. **Flexible Routing**: Custom HTTP/MCP prefixes per import
5. **Developer-Friendly**: Use `shared:sendEmail` notation everywhere
6. **Tree-Shakeable**: Global filtering with namespace awareness
7. **Type Safe**: TypeScript types flow across package boundaries

## Alternatives Considered

### Alternative 1: Hardcoded Namespaces
**Approach**: Each package declares its own namespace in its config. Consumers must use that fixed namespace.

**Pros**: Simpler implementation, no transformation needed

**Cons**:
- Namespace collisions if two packages choose same namespace
- No flexibility for consumers to rename
- Packages must coordinate namespace choices

### Alternative 2: No Namespaces (Flat Merge)
**Approach**: Merge all functions into single flat namespace with naming conventions to avoid collisions.

**Pros**: Simplest possible implementation

**Cons**:
- High risk of name collisions
- No isolation between packages
- Difficult to trace origin of functions
- Filtering becomes ambiguous

### Alternative 3: Re-inspect External Packages
**Approach**: Consumer runs inspector on external package source code.

**Pros**:
- Fresh metadata
- Can customize inspection

**Cons**:
- Requires pikku CLI compatibility
- Slower builds
- Requires access to source code (not just published package)

**Decision**: Selected the proposed UUID-based namespace approach for its balance of isolation, flexibility, and simplicity.

## Open Questions

1. **Service Dependencies**: How should services from external packages be handled? (Deferred to future work)
2. **Versioning**: How to handle multiple versions of same package? (Use npm's deduplication for now)
3. **Circular Dependencies**: Should we detect/prevent circular imports? (Future enhancement)
4. **Package Publishing**: Should packages publish their `.pikku` directory? (Yes, include in `files` field)

## Migration Path

For existing packages:
1. Auto-generate `namespace` UUID on first build after upgrade
2. No breaking changes to existing code
3. `externalPackages` is optional - packages work as before
4. Can incrementally adopt external packages

## Future Enhancements

1. **Service Resolution**: Cross-package service dependencies
2. **Dependency Graph**: Visualize package dependencies
3. **Namespace Aliases**: Allow multiple aliases for same import
4. **Version Constraints**: Enforce compatible Pikku versions
5. **Remote Imports**: Import from git URLs or package registries
6. **Partial Imports**: Import only specific functions from package
