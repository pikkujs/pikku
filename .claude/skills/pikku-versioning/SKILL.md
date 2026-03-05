---
name: pikku-versioning
description: 'Use when versioning Pikku function contracts, detecting breaking changes, or managing API backward compatibility. Covers the version property, versions.json manifest, contract hashing, and CI integration.
TRIGGER when: code uses version: on a pikkuFunc, user asks about API versioning, breaking changes, contract hashes, backward compatibility, or "pikku versions" CLI commands.
DO NOT TRIGGER when: user asks about secrets/variables/OAuth2 (use pikku-config) or general function definitions (use pikku-concepts).'
---

# Pikku Function Versioning

Track and protect function contracts across releases. Pikku hashes each function's input/output schema into a manifest so you can detect breaking changes before they ship.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions and their versions
```

See `pikku-concepts` for the core mental model.

## Function Versioning

Add `version` to function config to maintain backward compatibility:

```typescript
// v1 — kept for running workflows and agents
const getBookV1 = pikkuFunc({
  title: 'Get Book',
  version: 1,
  input: z.object({ bookId: z.string() }),
  output: z.object({ title: z.string() }),
  func: async ({ db }, { bookId }) => {
    return await db.getBook(bookId)
  },
})

// v2 — the latest version, called by default
const getBook = pikkuFunc({
  title: 'Get Book',
  input: z.object({
    bookId: z.string(),
    format: z.enum(['full', 'summary']),
  }),
  output: z.object({
    title: z.string(),
    author: z.string(),
    isbn: z.string(),
  }),
  func: async ({ db }, { bookId, format }) => {
    return await db.getBook(bookId, format)
  },
})
```

When you add a breaking change (new required fields, removed fields, type changes), bump the version number on the old function and create the new version without a `version` field (it becomes the latest).

## Version Manifest (`versions.json`)

Pikku tracks contract hashes to detect breaking changes:

```json
{
  "manifestVersion": 1,
  "contracts": {
    "createTodo": {
      "latest": 1,
      "versions": {
        "1": "a1b2c3d4e5f6g7h8"
      }
    },
    "getTodos": {
      "latest": 2,
      "versions": {
        "1": "i9j0k1l2m3n4o5p6",
        "2": "q7r8s9t0u1v2w3x4"
      }
    }
  }
}
```

Each hash is derived from the function's input and output schemas. If a schema changes without a version bump, `pikku versions check` will fail.

## CLI Commands

```bash
npx pikku versions init     # Initialize versioning manifest
npx pikku versions check    # Detect contract changes (use in CI)
npx pikku versions update   # Update contract hashes after version bump
```

**Workflow:**

1. `pikku versions init` — run once to create `versions.json`
2. Develop normally — add/modify functions
3. `pikku versions check` — CI catches unversioned breaking changes
4. If intentional: bump `version` on old function, then `pikku versions update`

## CI Integration

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx pikku versions check
```

## Complete Example

```typescript
// v1 — original contract
export const createTodoV1 = pikkuSessionlessFunc({
  title: 'Create Todo',
  version: 1,
  input: z.object({ title: z.string() }),
  output: z.object({ id: z.string(), title: z.string() }),
  func: async ({ todoStore }, { title }) => {
    return todoStore.add(title)
  },
})

// v2 — added priority field (breaking: new required input)
export const createTodo = pikkuSessionlessFunc({
  title: 'Create Todo',
  input: z.object({
    title: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
  }),
  output: z.object({
    id: z.string(),
    title: z.string(),
    priority: z.string(),
  }),
  func: async ({ todoStore }, { title, priority }) => {
    return todoStore.add(title, priority)
  },
})
```
