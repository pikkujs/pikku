---
name: pikku-versioning
description: >-
  Use when versioning Pikku function contracts, detecting breaking changes, or managing API
  backward compatibility. Covers the version property, versions.pikku.json manifest, contract
  hashing, and CI integration. TRIGGER when: code uses version: on a pikkuFunc, user asks about
  API versioning, breaking changes, contract hashes, backward compatibility, or "pikku versions"
  CLI commands. DO NOT TRIGGER when: user asks about secrets/variables/OAuth2 (use pikku-config)
  or general function definitions (use pikku-concepts).
installGroups: [core]
---

# Pikku Function Versioning

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
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

A function with `version: N` is registered under the id `name@vN`. The bare
name still resolves to it, so callers that don't care about versions keep
working while a pinned `getBook@v1` stays addressable for the ones that do.

**The pattern:** when you need to introduce a breaking change, copy the current
function into a pinned `v1` and bump the live one to `version: 2`.

1. Create `my-function-v1.function.ts` exporting `getBookV1` with `version: 1` —
   the trailing `V1` matching the version is stripped automatically, so the id
   becomes `getBook@v1`
2. Add `version: 2` to the existing `getBook`

```typescript
// my-function-v1.function.ts — old contract, kept for running workflows/agents
export const getBookV1 = pikkuFunc({
  version: 1, // id becomes getBook@v1 — the V1 suffix is stripped
  input: z.object({ bookId: z.string() }),
  output: z.object({ title: z.string() }),
  func: async ({ db }, { bookId }) => {
    return db.getBook(bookId)
  },
})

// my-function.function.ts — latest contract, id becomes getBook@v2
export const getBook = pikkuFunc({
  version: 2,
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

**Bump the live function explicitly.** Nothing promotes an unversioned function
to the next version for you — without `version: 2` it is treated as version 1 of
the `getBook` contract, colliding with the pinned `getBook@v1` and making
`versions check` report the published contract as modified.

**`override` is the escape hatch, not the requirement.** The contract key comes
from the exported name with a matching `V<n>` suffix removed, so
`getBookV1` + `version: 1` already lands on `getBook`. Use
`override: 'getBook'` only when the export can't follow that convention — for
instance `legacyGetBook` with `version: 1`, which would otherwise key under
`legacyGetBook`.

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

Each hash is derived from the function's input and output schemas plus the
contract key. If a schema changes without a version bump, `pikku versions check`
will fail.

The manifest lives at `versions.pikku.json` in the project's `rootDir`, and its
presence is what switches versioning on — with no manifest, nothing is checked.

## CLI Commands

```bash
npx pikku versions init     # Create an empty versioning manifest (run once)
npx pikku versions check    # Detect contract changes (use in CI)
npx pikku versions update   # Record current contract hashes
```

`init` writes `{ "manifestVersion": 1, "contracts": {} }` and nothing more — it
does **not** capture the hashes of the functions you already have. Run
`versions update` straight after it to record the current state, otherwise
`check` has nothing to compare against and silently passes.

`update` refuses to save when a published version's hash changed, so it can
never overwrite an immutable record; it reports that as a diagnostic and leaves
the manifest alone. Fix the contract or bump the version, then run it again.

**Workflow:**

1. `pikku versions init` then `pikku versions update` — once, to create and
   populate `versions.pikku.json`
2. Develop normally — add/modify functions
3. `pikku versions check` — CI catches unversioned breaking changes
4. If intentional: pin the old contract as `…V1` with `version: 1`, bump the
   live function to `version: 2`, then `pikku versions update`

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
// create-todo-v1.function.ts — v1 locked contract, id: createTodo@v1
export const createTodoV1 = pikkuSessionlessFunc({
  version: 1,
  input: z.object({ title: z.string() }),
  output: z.object({ id: z.string(), title: z.string() }),
  func: async ({ todoStore }, { title }) => todoStore.add(title),
})

// create-todo.function.ts — v2 (latest), called by default
export const createTodo = pikkuSessionlessFunc({
  version: 2,
  input: z.object({
    title: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
  }),
  output: z.object({
    id: z.string(),
    title: z.string(),
    priority: z.string(),
  }),
  func: async ({ todoStore }, { title, priority }) =>
    todoStore.add(title, priority),
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
