---
'@pikku/inspector': minor
'@pikku/core': minor
'@pikku/cli': minor
---

**feat: Implement verbose metadata system with JSDoc extraction**

This release introduces a comprehensive documentation and metadata system that provides both optimized runtime metadata and verbose documentation metadata.

## Key Features

### Phase 1: Flatten PikkuDocs into Meta Types
- Moved documentation fields (summary, description, errors) from separate PikkuDocs objects into all meta types
- Unified metadata structure across functions, HTTP routes, channels, schedulers, queues, MCP endpoints, CLI commands, and workflows
- Improved type consistency and reduced complexity

### Phase 2: Runtime/Verbose Meta Split
- Split metadata generation into two modes:
  - **Runtime metadata**: Minimal, optimized for production bundles (no documentation fields)
  - **Verbose metadata**: Includes all documentation fields for development and tooling
- Significantly reduces bundle sizes in production (documentation can account for substantial payload)
- Generated files:
  - Runtime: `pikku-*-meta.gen.json` and `pikku-*-meta.gen.ts`
  - Verbose: `pikku-*-meta.verbose.gen.json` and `pikku-*-meta.verbose.gen.ts`

### Phase 3: JSDoc Extraction
- Automatically extracts JSDoc tags from function definitions:
  - `@summary` - Short one-line description
  - `@description` - Detailed explanation
  - `@errors` - Array of possible error descriptions
- Supports fallback to inline docs when JSDoc tags are not present
- Works across all function types (HTTP, channels, schedulers, queues, MCP, CLI, workflows)

### CLI Flag: --verbose-meta
- New `--verbose-meta` flag to conditionally generate verbose metadata files
- Can be set via:
  - Command line: `pikku all --verbose-meta`
  - Config file: `"verboseMeta": true` in pikku.config.json
- Default is `false` to minimize bundle size

### Type Safety Improvements
- Added proper type casts for JSON-imported metadata to preserve TypeScript literal types
- Fixes issues where `type: string` was inferred instead of literal types like `'wire'`, `'tag'`, `'http'`
- Ensures MiddlewareMetadata and PermissionMetadata union types work correctly

## Breaking Changes

⚠️ **Metadata Structure Changes**
- Documentation fields are no longer in `pikkuDocs` - they're now directly in metadata objects
- If you were accessing `meta.pikkuDocs.summary`, update to `meta.summary`
- Runtime metadata files no longer contain documentation fields by default

## Migration Guide

**Before:**
```typescript
const summary = functionsMeta.myFunction?.pikkuDocs?.summary
```

**After:**
```typescript
// For runtime (no docs)
const summary = functionsMeta.myFunction?.summary // undefined in runtime mode

// For verbose metadata (with docs)
import { pikkuState } from '@pikku/core'
const verboseMeta = pikkuState('function', 'meta') // Load from verbose file
const summary = verboseMeta.myFunction?.summary
```

**Enable verbose metadata in config:**
```json
{
  "verboseMeta": true,
  "openAPI": {
    "outputFile": ".pikku/openapi.json"
  }
}
```

## Benefits

1. **Smaller Production Bundles**: Runtime metadata excludes all documentation
2. **Better DX**: JSDoc comments are automatically extracted and included in verbose metadata
3. **Flexible**: Choose when to include docs based on environment (dev vs prod)
4. **Type-Safe**: Proper TypeScript literal types preserved throughout the system
5. **Consistent**: Unified metadata structure across all wiring types
