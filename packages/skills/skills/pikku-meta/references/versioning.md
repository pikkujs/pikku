# Pikku Function Versioning

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

## The `pikku release` command

`versions check` and `release` answer different questions and share no state.
`check` is a within-repo gate — "you changed a contract without bumping
`version:`". `release` is a release question — "what does this build owe the
clients of the last release, and how do we ship it?". The baseline is
`surface.pikku.json`, the snapshot committed by the previous release.

```bash
npx pikku release init                                   # first run: snapshot + CHANGELOG.md
npx pikku release diff                                   # vs surface.pikku.json
npx pikku release diff --against https://api.acme.com/surface.json  # vs any baseline
npx pikku release diff --fail-on major                   # PR gate
npx pikku release snapshot --out surface.json            # write a snapshot
npx pikku release prepare                                # bump, changelog, push release/next
npx pikku release publish                                # tag + fast-forward, one atomic push
```

`--against` takes three things and tells them apart itself: a directory is read
as a `.pikku` tree, an `http(s)` URL is fetched as a published snapshot, and any
other file is read as a snapshot. `snapshot` without `--out` writes to stdout
_after_ the CLI banner, so a bare `> file.json` captures the banner too.
`pikku semver` is a deprecated alias for `release diff` / `release snapshot`.

### Shipping a release

Work lands on the trunk branch (default `staging`); production (default `main`)
only ever fast-forwards to a tagged release. Nothing is force-pushed except the
disposable `release/next` branch, and no host API is used — plain git only.

1. `prepare` runs on a checkout of `origin/staging` after `pikku all`. It diffs
   the surface against `surface.pikku.json`, reads the commits production does
   not have yet, bumps `package.json`, prepends a `CHANGELOG.md` section,
   rewrites the snapshot, and pushes that one commit to `release/next`. No
   commits since the last release means nothing to release.
2. `publish` is the ship decision. It fast-forwards `staging` and `main` to
   `release/next`, pushes the `vX.Y.Z` tag and deletes `release/next` in one
   `--atomic` push, so it lands entirely or not at all.

It refuses when `release/next` was prepared on an older `staging` (prepare
again), or when `main` has commits `staging` lacks (merge `main` into `staging`
with a merge commit first).

The bump comes from the surface diff alone — there is no manual override. A
release whose surface did not move is a patch. Below 1.0 a breaking change
is a minor, like any other surface change; from 1.0 it is a major. 1.0.0 is
never reached by a diff: `pikku release prepare --go-live` releases it once,
when the app is live. A `Release-Note: …` commit trailer adds a line to the
changelog's Notes section. Branch names are configurable in `pikku.config.json`:

```json
{
  "release": {
    "trunk": "staging",
    "production": "main",
    "branch": "release/next",
    "remote": "origin"
  }
}
```

The verdict, in order:

- **major** — a function or client-facing wiring was removed, or a surviving
  one tightened its contract.
- **minor** — anything was added, or a contract loosened compatibly.
- **patch** — the surface did not move; the release is internal work.

Below the id level it reads the generated JSON Schemas, and **direction
decides**. An input is contravariant (the caller writes it) and an output is
covariant (the caller reads it), so the same edit is not the same event on both:

| Change                         | On an input                          | On an output |
| ------------------------------ | ------------------------------------ | ------------ |
| field removed                  | breaking (when the schema is closed) | breaking     |
| required field added           | breaking                             | compatible   |
| field became optional          | compatible                           | breaking     |
| optional field became required | breaking                             | compatible   |
| enum value removed             | breaking                             | compatible   |
| enum value added               | compatible                           | breaking     |
| type changed                   | breaking                             | breaking     |

It consumes `versions.pikku.json`: published versions are immutable, so a
function id that left the source while the manifest still records it is a `@vN`
bump, not a removal — that is what keeps a deliberate version bump at `minor`.
Without the manifest the same disappearance reads as `major`, which is the safe
reading rather than a wrong one.

Two things it deliberately will not guess. A named schema whose body did not
travel with the baseline falls back to `contractHash` and, if that moved, is
reported **breaking with the reason stated** — never quietly "unchanged". And at
the wiring level only `auth` going from absent/false to true is classified as
breaking; every other metadata change is reported as compatible, because there
is no general way to tell a cosmetic wiring edit from a restricting one.

`release diff` writes `.pikku/changes.gen.json` (override with `--out`), so it rides the
same meta pipeline as `audit.json`:

```json
{
  "schemaVersion": 1,
  "baseline": "https://api.acme.com/surface.json",
  "verdict": "major",
  "summary": { "breaking": 1, "added": 1, "removed": 0, "modified": 1 },
  "changes": [
    {
      "kind": "function",
      "id": "getUser",
      "status": "modified",
      "breaking": true,
      "reasons": ["input.tenant: required field added"]
    }
  ]
}
```

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
      # Refuse to ship a breaking change to production unintentionally.
      - run: npx pikku release diff --fail-on major
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
