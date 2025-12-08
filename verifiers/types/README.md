# Type Checks

This package contains TypeScript type constraint tests for the Pikku framework. It verifies that invalid usage patterns are properly caught by TypeScript's type system.

## Purpose

The type-checks package ensures that:

- Invalid route/query/param configurations are caught at compile time
- Function signatures are properly validated
- Channel, middleware, and other wiring types are correctly enforced
- Regression prevention for type safety improvements

## Structure

Constraints are organized by Pikku component type:

- `src/http/` - HTTP wiring type constraints (routes, params, queries, methods)
- `src/channel/` - Channel wiring type constraints (WebSocket channels)
- `src/function/` - Core function type constraints (input/output types)
- `src/mcp/` - MCP (Model Context Protocol) type constraints
- `src/scheduler/` - Scheduler type constraints
- `src/queue/` - Queue worker type constraints
- `src/cli/` - CLI command type constraints
- `src/valid-functions/` - Minimal valid functions for type generation (do not modify)

## Adding New Constraints

1. Choose the appropriate directory for your constraint (`src/http/`, `src/channel/`, etc.)
2. Create a new file with a descriptive name (e.g., `route-param-mismatch.ts`)
3. Import the necessary types from `@pikku/core` and wirings from `../../.pikku/pikku-types.gen.js`
4. Write code that **should** produce type errors
5. Mark expected errors with `// @ts-expect-error` on the line before
6. Include valid examples to ensure the types work correctly when used properly

### Example

```typescript
// src/http/route-param-mismatch.ts
import { wireHTTP } from '#pikku'
import type { CorePikkuFunctionSessionless } from '@pikku/core'

// @ts-expect-error - Route has :id param but function doesn't accept it
wireHTTP({
  method: 'get',
  route: '/users/:id',
  func: (async () => {}) as CorePikkuFunctionSessionless<{}, void>,
})

// This should work fine (no error expected)
wireHTTP({
  method: 'get',
  route: '/users/:id',
  func: (async () => {}) as CorePikkuFunctionSessionless<{ id: string }, void>,
})
```

## Running Tests

```bash
# Run all type constraint tests
npm test

# Or directly
bash run-tests.sh
```

The test script will:

1. Run TypeScript compiler in check mode (`tsc --noEmit`)
2. Verify that every `// @ts-expect-error` annotation has a corresponding type error
3. Verify that no unexpected errors occur
4. Report success/failure

## Test Output

- ✅ Pass: All expected errors occur, no unexpected errors
- ❌ Fail: Missing expected errors or unexpected errors found

The script will show detailed information about:

- Which `@ts-expect-error` lines are missing errors
- Which lines have unexpected errors
- A summary of total errors vs expected errors
