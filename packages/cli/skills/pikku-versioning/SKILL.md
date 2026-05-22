---
name: pikku-versioning
description: 'Use when versioning Pikku function contracts, detecting breaking changes, or managing API backward compatibility. Covers the version property, versions.pikku.json manifest, contract hashing, and CI integration.
TRIGGER when: code uses version: on a pikkuFunc, user asks about API versioning, breaking changes, contract hashes, backward compatibility, or "pikku versions" CLI commands.
DO NOT TRIGGER when: user asks about secrets/variables/OAuth2 (use pikku-config) or general function definitions (use pikku-concepts).'
---

# Pikku Function Versioning

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Track and protect function contracts across releases. Pikku hashes each function's input/output schema into a manifest so you can detect breaking changes before they ship.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions and their versions
```

See `pikku-concepts` for the core mental model.

## Function Versioning

When you need to introduce a breaking change, keep the old function as a pinned version and let the new one become the latest.

**The pattern:**
1. Create a new file `my-function-v1.function.ts` — export a variable with the `V1` suffix
2. Set `override: 'myFunction'` — this is the contract key the manifest groups under
3. Set `version: 1` — pins this as version 1 of the contract
4. The existing `my-function.function.ts` (no `version:` field) automatically becomes the latest version

```typescript
// my-function-v1.function.ts — old contract, kept for running workflows/agents
export const getBookV1 = pikkuFunc({
  override: 'getBook',   // REQUIRED — links this to the 'getBook' contract family
  version: 1,
  input: z.object({ bookId: z.string() }),
  output: z.object({ title: z.string() }),
  func: async ({ db }, { bookId }) => {
    return db.getBook(bookId)
  },
})

// my-function.function.ts — latest contract, no version: field
export const getBook = pikkuFunc({
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
    return db.getBook(bookId, format)
  },
})
```

**Why `override` is required:** The manifest groups functions by a shared contract key. Without `override: 'getBook'`, `getBookV1` is stored internally as `getBookV1@v1` (key: `getBookV1`), which is a different contract family from `getBook`. With `override: 'getBook'`, it becomes `getBook@v1` (key: `getBook`), which groups with the unversioned `getBook` — and the unversioned one is automatically promoted to `getBook@v2`.

## Version Manifest (`versions.pikku.json`)

Pikku tracks contract hashes to detect breaking changes:

```json
{
  "manifestVersion": 1,
  "contracts": {
    "createTodo": {
      "latest": 1,
      "versions": {
        "1": { "inputHash": "a1b2c3d4", "outputHash": "e5f6a7b8" }
      }
    },
    "getTodos": {
      "latest": 2,
      "versions": {
        "1": { "inputHash": "i9j0k1l2", "outputHash": "m3n4o5p6" },
        "2": { "inputHash": "q7r8s9t0", "outputHash": "u1v2w3x4" }
      }
    }
  }
}
```

Each hash is derived from the function's input and output schemas plus the contract key. If a schema changes without a version bump, `pikku versions check` will fail.

## CLI Commands

```bash
npx pikku versions init     # Initialize versioning manifest (run once)
npx pikku versions check    # Detect contract changes (use in CI)
npx pikku versions update   # Update contract hashes after version bump
```

**Workflow:**

1. `pikku versions init` — run once to create `versions.pikku.json`
2. Develop normally — add/modify functions
3. `pikku versions check` — CI catches unversioned breaking changes
4. If intentional: create `my-function-v1.function.ts` with `override` + `version: 1`, then `pikku versions update`

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
// create-todo-v1.function.ts — v1 locked contract
export const createTodoV1 = pikkuSessionlessFunc({
  override: 'createTodo',  // groups under 'createTodo' contract family
  version: 1,
  input: z.object({ title: z.string() }),
  output: z.object({ id: z.string(), title: z.string() }),
  func: async ({ todoStore }, { title }) => todoStore.add(title),
})

// create-todo.function.ts — v2 (latest), called by default
export const createTodo = pikkuSessionlessFunc({
  input: z.object({
    title: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
  }),
  output: z.object({
    id: z.string(),
    title: z.string(),
    priority: z.string(),
  }),
  func: async ({ todoStore }, { title, priority }) => todoStore.add(title, priority),
})
```

Result in manifest:
```json
"createTodo": {
  "latest": 2,
  "versions": {
    "1": { "inputHash": "...", "outputHash": "..." },
    "2": { "inputHash": "...", "outputHash": "..." }
  }
}
```
