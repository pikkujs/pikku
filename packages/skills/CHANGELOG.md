# @pikku/skills

## 0.12.5

### Patch Changes

- fd72e58: Drop `scenario.step` — a scenario step is now always a `given`, `when` or
  `then`.

  `step` rendered no keyword, which made it the phase to reach for whenever a
  step did not obviously fit one of the three. That is exactly the step a reader
  cannot check: a scenario is read by people deciding whether it describes the
  behaviour they wanted, and a row that says what it does without saying whether
  it is setup, action or claim tells them nothing to agree or disagree with. It
  was also the escape hatch from the assertion lint — a scenario with no `then`
  could be made to stop complaining by demoting its steps rather than by
  asserting anything.

  Replace `scenario.step(...)` with whichever of `given`, `when` or `then` the
  step actually is. `then` is not a rename: it makes the step's bindings
  witnesses rather than alternatives, so every declared surface runs and they
  must agree.

- 75e81b1: Document `pikkuServerLifecycle` in the skills corpus. `pikku-concepts` now presents both bootstrap paths (letting `pikku dev`/`pikku serve` own the server vs. embedding in your own runtime) instead of only the hand-rolled entrypoint, `pikku-services` gains a `pikkuServerLifecycle` reference covering hook ordering, discovery rules and the `afterStop`-runs-after-services-stop caveat, and `pikku-config` documents the `lint` severity map including `customServerBootstrap`.

## 0.12.4

### Patch Changes

- 8075f6a: Confine `SecretService` to the places an app is wired.

  `secrets` is now omitted from the services every function, AI agent, workflow,
  permission and wire receives, and the function runner replaces it with a
  throwing accessor so a cast cannot reach past the type. It stays available in
  `pikkuServices`, `pikkuWireServices`, addon service factories and middleware —
  read a secret there, give it to a service, and have the function ask that
  service.

  Alongside it:
  - `wireSecret` gains `allowedHosts`, refusing a secret attached to a host it was
    not declared for. Permissive by default; strict via
    `config.secrets.requireAllowedHosts`.
  - `pikku-graph`'s `httpRequest` resolves and attaches its credential inside a new
    `httpRequester` service instead of holding the plaintext in the function.
  - New inspector diagnostics: `PKU950` (a `SecretService` exposed under another
    service name), `PKU951` (a secret read that no `wireSecret` declares) and
    `PKU952` (a secret read with a non-literal key).

## 0.12.3

### Patch Changes

- a7b26c5: rename the inspected declarations to `define*`: `wireScope` → `defineScope`, `wireSecret` → `defineSecret`, `wireVariable` → `defineVariable`, `wireCredential` → `defineCredential`

  `wire*` meant two unrelated things. A transport wiring attaches a function to
  something that can invoke it — `wireHTTP`, `wireChannel`, `wireScheduler`,
  `wireQueueWorker` and the rest — and the thing it wires runs. These four wire
  nothing: they are no-ops that exist only so the call typechecks, they are
  tree-shaken out of the build, and their whole job is to be found by the
  inspector's AST pass and turned into a type union. One word for both left the
  declaration reading like a registration with a runtime.

  So the vocabulary splits: **`wire*` is a transport, `define*` is an inspected
  declaration.**

  ```ts
  import { defineScope } from '@pikku/core/scope'
  import { defineSecret } from '@pikku/core/secret'
  import { defineVariable } from '@pikku/core/variable'
  import { defineCredential } from '@pikku/core/credential'

  defineScope({ admin: { scopes: { invoices: { scopes: { create: {} } } } } })
  ```

  **Breaking:** no alias is kept. Rename the four call sites; the module subpaths
  (`@pikku/core/scope`, `/secret`, `/variable`) are unchanged.

  The inspector matches these by identifier text, so a stale `wire*` call is not a
  type error — it is silently not extracted, and the generated union comes back
  empty. That fails as "this scope isn't declared" on code that was fine a moment
  ago, nowhere near the declaration. Grep for the old names rather than trusting a
  clean build.

  An addon published with `.pikku` output generated before this release re-exports
  `wireSecret` from `@pikku/core/secret` and will not typecheck against this core
  until it is rebuilt and republished.

- 457cb25: Add `definePersonas()`: the people a project's scenarios and virtual users run
  as, declared in code.

  There used to be three names for two-and-a-bit things — an _actor_ in
  `scenarios.actors`, a _persona_ in `scenarios.personas`, and a _virtual user_
  declared separately against an actor. In practice almost every actor was its own
  kind, so the second set carried no information and the third was a third place
  for a name to drift. There is now one declaration:

  ```ts
  definePersonas({
    shopper: {
      name: 'Sam Shopper',
      jobTitle: 'Shopper',
      personality: 'Buys in a hurry and leaves tabs open',
      roles: ['customer'],
      disposition: 'careless',
      goals: ['Buy something without reading anything'],
      account: {},
    },
  })
  ```

  A persona is a person: what they are like, what they want, the roles they hold,
  and **one** account they sign in with — `account: {}` plus `linkedAccounts` for
  the rare case of more, modelled on how better-auth does linking. A persona with a
  `disposition` is a virtual user; `runnable: false` marks someone who only ever
  exists to be acted upon — banned, shared with, reset — and is never handed a
  session.

  **A persona names roles, never scopes.** Scopes come from `defineSystemRole()`
  expansion, so the build fails if a persona names a role nobody declared, and
  fails again if a role confers a scope no `defineScope` declares. Running one only
  ever has to check that its roles are still valid.

  **Addresses are computed, never declared.** `personaEmail(id, domain, runId)`
  derives `<id>[+runId]@<domain>` from `scenarios.emailDomain`, so a seed, a
  scenario run and a virtual-user run cannot disagree about who they are signing in
  as. `scenarios.actors` and `scenarios.personas` are gone from
  `pikku.config.json` — only `emailDomain` remains.

  `actor` survives in exactly one place: the name of a **slot in a scenario step**,
  which is the role a persona is cast in for that step. `pikkuVirtualUser()`,
  `kind`, `grants` and the `actor` field are removed; the `actors` service is now
  `personas`, and the CLI's `virtual-user` commands are now `pikku persona list` /
  `pikku persona run`. `budget` and `allowApprovalRequired` moved to run flags —
  how much you will spend today is not a fact about a person.

  `@pikku/cucumber` drops its `Actor` class and `ActorDispatchContext`: a
  hand-rolled cookie jar that a persona's own typed session replaces outright.

- 86a50b9: scenario: replace `browser: true` + `func` with per-surface bindings on `pikkuScenarioStep`

  A step now declares one implementation per surface it can be driven through:

  ```ts
  export const buysTheItem = pikkuScenarioStep<{ sku: string }, { orderId: string }>({
    name: 'buysTheItem',
    description: 'buys the item',
    browser: async (services, data, { browser }) => { ... },
    default: async (services, data, { rpc }) => { ... },
  })
  ```

  `pikku scenario run --run browser|cli|default` picks which surface the run drives,
  and the two phases resolve bindings differently:
  - **Actions** (`given` / `when` / `step`) run exactly one binding — the run
    surface if it has one, otherwise `default`. A step with neither now fails with
    `ScenarioNoSurfaceBinding` instead of silently running server-side.
  - **Assertions** (`then`) are witnesses, not alternatives: every declared binding
    runs and they must agree. Two surfaces reporting different things fails the run
    with `ScenarioWitnessDisagreement` rather than reporting a pass. An assertion
    with no witness the run can execute at all fails with `ScenarioNoWitness` —
    without it the step returns `undefined` and renders as a tick, reporting a pass
    for something nobody checked.

  A scenario written as a step ladder that never calls `then` is now a **PKU680**
  critical. It proves only that nothing threw, so an assertion-free ladder of
  browser-bound actions would score perfect coverage while checking nothing.

  The report gains a surface-coverage line — `n/m steps ran on browser`, counted
  over every step, so an action that fell back to the server lowers the ratio
  rather than needing a footnote. That also makes surfaces comparable over one
  denominator: a scenario is `4/4` on a default run and `3/4` on a browser one.
  Assertions that fell back are named separately and gate `--strict`, since a
  sentence claiming the actor saw something nobody looked at is a different problem
  from an action taking a shortcut.

  **Breaking:** `browser: true` and the third `B extends boolean` type argument are
  gone. Rename `func` to `default` (or to `browser` where the step drove a browser)
  and drop the type argument.

## 0.12.2

### Patch Changes

- b89d3b3: Bring the knowledge base into OSS: a package, a CLI gate, a console browser and a skill

  `knowledge/` is where a project records the things `pikku meta` cannot tell you —
  what a slice is for, which rule was chosen and what it rules out, what is still an
  open question. Tables, routes, schemas and permissions are generated, so a note
  that repeats them is a copy that will drift, and the profile refuses the sections
  where that happens.
  - **`@pikku/knowledge`** (new) reads the notes, builds the link graph in both
    directions, and validates the app-project profile: every note typed, every
    section indexed, every slice carrying a third-person gherkin scenario and at
    most three entities, and every `resource:` URI resolving against the generated
    meta. The resource check fails closed on drift and open on ignorance — a prefix
    whose meta is absent is skipped rather than called dangling.
  - **`pikku knowledge validate`** and **`pikku knowledge index`** replace the dead
    three-flat-files check. Both exit non-zero on an inconsistent base, so a
    pipeline can stop on one; `index` refreshes each `index.md` listing while
    leaving the prose around it alone, and now gives a section that holds only
    sub-sections an index of its own instead of leaving it unreachable.
  - **The console** gains a read-only Knowledge page: notes grouped by section,
    a rendered document with its tags, resources, links in both directions and the
    findings against it, and intra-bundle markdown links that open the linked note
    instead of leaving the page. Read-only by design — a note is edited in the repo,
    in the same commit as the code it describes.
  - **The `pikku-knowledge` skill** documents the format for agents, and Fabric
    builds on it rather than restating it.
  - **`@pikku/inspector`**: a zod schema imported from a built workspace package
    resolved to that package's `.d.ts`, which has no runtime exports at all, so
    every schema in it was reported missing. The emitted JS beside it is imported
    instead.

- e14c530: Drop OpenCode-specific discovery guidance from the bundled skills

  Step 1 of the execution checklist in 43 skills opened with "Prefer OpenCode
  tools such as `pikku-meta` when available; otherwise run the relevant
  `pikku meta ... --json` command". The skills ship to every agent that reads
  them, most of which have no such tools, so the preferred branch was dead
  advice that an agent had to reason past before reaching the instruction that
  actually applies.

  The step now just says to run `pikku meta ... --json`. The README still notes
  that the frontmatter shape is the one Claude Code, opencode and pi.dev all
  parse — that is a compatibility fact about the format, not a routing hint.

## 0.12.1

### Patch Changes

- 637e668: Move the bundled agent skills out of `@pikku/cli` into a new MIT-licensed `@pikku/skills` package.

  The skills are the open core — the instruction set any harness reads to build, wire and deploy a Pikku project — but they shipped inside `@pikku/cli`, whose `files` array carried `skills/` under BUSL-1.1 with no carve-out. Their terms now stand on their own package and no longer depend on the CLI that installs them.

  This also fixes `pikku skills install` on the native binaries. `bun build --compile` only bundles the JS import graph, so 81 markdown files reached through `readdir` never made it in: every Homebrew install failed with `Could not locate bundled skills directory`, while npm installs worked. `@pikku/skills` ships both the `skills/` directory and an embedded path → contents manifest, and reads prefer the directory when one exists — so skill edits stay live in development, and the binary falls back to the manifest it now carries.

  No skill content changed, and `pikku skills install` takes the same flags.
