# @pikku/skills

## 0.12.12

### Patch Changes

- 8d6a6bc: fix(cli): a scaffold flag says a surface exists, not who may call it

  `scaffold.<feature>` accepted an `auth` field, and the generated wrapper emitted
  it onto the wired function. That put authentication in two places at once: the
  target function already declares whether it needs a session, its wiring, its
  scopes and its addon gate already refine it, and `runPikkuFunc` already enforces
  all of that on every call. The scaffold flag only stacked a coarser gate in
  front of the one that actually decides, and — being a config field — it could
  disagree with the function it was gating.

  `PikkuScaffoldFeature` is now `boolean | { path?: string }`. It answers two
  things and no more: whether the surface is generated, and where the file is
  written. A feature that was `{ "auth": false }` becomes plain `true`, and
  `pikku enable` loses its `--noAuth` flag along with the dimension it set.

  The six generators that took the flag no longer take one. The four that generate
  a dispatcher — public RPC, public agent, workflow routes and the events channel
  — now emit a fixed `auth: false`. That is the wrapper declining to gate, not the
  scaffold declaring the surface public: `rpcCaller` forwards to whichever
  function the caller named, and that function's own `auth`, permissions, scopes
  and addon gate are what decide. Emitting nothing would not be neutral, since a
  wiring without `auth` requires a session and would reject the call before the
  gate that decides ever ran. The two that generate scoped admin functions — user
  admin and virtual users — emit no `auth`, because they are `pikkuFunc` with
  their own `scopes`: session-required by construction, and the deciding function
  rather than a wrapper in front of one.

  The legacy `'auth'` / `'no-auth'` string values are gone with it. A bare string
  is still refused rather than read as a `path`: under `boolean | object` no
  string is valid, so guessing one would turn a typo into a generated file nobody
  asked for.

- 31ad85f: fix(emails): escape substituted values in the generated email renderer

  `renderEmailTemplate` spliced values into HTML unescaped and looped substitution
  until it reached a fixed point, so a value containing `"` broke out of the
  attribute it landed in, a value containing markup was injected verbatim, and a
  value containing `{{...}}` was re-expanded as a template on the next pass. An
  ordinary CSS font stack from `theme.json` was enough to corrupt the document.

  Rendering is now layered by trust. Partials are inlined first; `theme.*` and
  `t.*` are expanded next as template-author input; caller `data` is substituted in
  a single pass that is never rescanned. Values are HTML-escaped in `.html` output
  and left raw in `.subject.txt` / `.text.txt`. `{{content}}` and partials stay
  raw, and `{{{value}}}` is a new opt-in raw form. The console's email preview uses
  the same renderer, so previews match what is sent.

## 0.12.11

### Patch Changes

- 7722ceb: Split the addon leaf so an application cannot shadow a linked addon's own

  An addon authored its services through `#pikku/addon`, and so did an
  application installing one. Node keeps those apart — `#pikku/*` is a
  package-private subpath import, resolved against the addon's own
  `package.json` — but tsconfig `paths` are global to a tsx process, and every
  runtime template maps `#pikku/*` onto a sibling package. A linked addon's
  `#pikku/addon` was resolved against the _application's_ leaf, which holds the
  install half and none of the authoring exports, and every template failed to
  boot with `does not provide an export named 'pikkuAddonServices'`.

  The authoring half now sits at `#pikku/addon/setup`. An application generates a
  flat `.pikku/<leaf>`, so there is nothing there for that specifier to match and
  the resolver falls back to Node, which reads the addon's own imports. Addons
  declaring themselves import `pikkuAddonConfig`, `pikkuAddonServices` and
  `pikkuAddonWireServices` from `#pikku/addon/setup`; `wireAddon` and
  `wireRemoteAddon` stay at `#pikku/addon`.

  `wireAddon` and `wireRemoteAddon` also move off `@pikku/core/rpc` onto
  `@pikku/core/addon`. Being reached over rpc is how an addon is called rather
  than what it is, and it put the whole addon surface behind the rpc subpath for
  consumers that only wanted to install one.

- 6eef0a0: Bump every dependency to its latest compatible minor/patch across the monorepo.
- 3b1164a: feat(react,mantine): ship the dev actor switcher instead of making every app copy it

  The dev-only "Sign in as …" control — one click signs in as a declared scenario
  persona, no password — was hand-copied into every app that needed it, because
  `pikku fabric validate` requires any frontend with a login screen to have one.
  The `devActors()` / `signInAsActor()` pair was byte-identical everywhere it
  landed, including the `import.meta.env.DEV` gate that keeps the shared secret out
  of production bundles. That is not a thing each app should be re-deriving from a
  copy-paste.

  Split along the dependency line:

  - `@pikku/react` gains `useDevActors()`, `signInAsActor()` and `parseDevActors()`.
    UI-free, so it stays inside the package's react-only dependency budget.
  - `@pikku/mantine/dev` gains `<DevActorSwitcher />`, built on that hook. It is a
    new entry point rather than part of `/core`, because `/core`'s contract is
    "drop-in alias for `@mantine/core`" and exporting a component Mantine has no
    counterpart for would break it.

  The component takes `onSignedIn` rather than depending on a router, and the
  actors/secret are passed in rather than read from env — how env is spelled is a
  bundler fact (`import.meta.env.VITE_*` vs `process.env.NEXT_PUBLIC_*`), and a
  package that guesses gets it wrong for half its consumers.

  The skills document it in the four places an agent would look: `pikku-better-auth`
  for the `actor` plugin's endpoint (which had only `/dev/quick-login` before, and
  so sent agents to the wrong control), `pikku-scenario` for the actor list being
  the same one a human signs in through, `pikku-react` for the hook, and
  `pikku-fabric` for the validate rule that requires it.

  `fabric validate` now also accepts a `useDevActors()` call site as evidence the
  control is wired, so apps that want their own UI on the shared logic pass. The
  hand-rolled shape still passes too — nothing existing breaks. Its fix text no
  longer tells you to hand-write the helper, which would have become wrong advice
  the day this shipped.

- 266e3bc: `#pikku` is a namespace, not a module: one subpath per wiring

  The bare `#pikku` specifier resolved to `.pikku/pikku-types.gen.ts`, a hub that
  re-exported all twelve wiring leaves with `export *` — undoing the split the
  leaves exist for, each of which still says so in its own generated header
  ("HTTP-specific type definitions for tree-shaking optimization"). Reaching that
  hub put 33 distinct `@pikku/core` subpaths into the module graph, and neither
  consumer could drop them again: bundlers keep `export *` chains because the app
  declares no `sideEffects`, and Node and tsx do not tree-shake at all, so an app
  with no queues still executed `@pikku/core/queue` at boot.

  The hub is gone. An app now imports the leaf the name belongs to —
  `#pikku/function`, `#pikku/http`, `#pikku/workflow` — and a project's `imports`
  map declares two patterns, because both resolvers pick the more specific one:

  ```json
  "#pikku/*.js": "./.pikku/*.ts",
  "#pikku/*": "./.pikku/*/index.ts"
  ```

  A source tree names the `.ts` on both. Webpack, esbuild and Bun all rewrite a
  `.js` specifier to the `.ts` beside it for a relative import but not for an
  imports-map target, so a `.js` target there resolves to a file that does not
  exist. The two places that keep `.js` are the ones where it is the real file: a
  published addon, whose map points into `dist`, and a project that imports a
  declaration-only generated file such as `pikku-rpc-wirings-map.gen.d.ts`, where
  naming the `.js` lets the type resolver's own mapping reach the `.d.ts`.

  `pikku` generates the leaf indexes and removes the hub, and `pikku validate`
  reports a barrel import as an error. The split also turns the addon boundary
  from advice into a rule: an addon never generates the wiring leaves, so
  `#pikku/http` fails at the specifier rather than yielding "no exported member"
  from a hub that quietly dropped the re-export.

- 9fce0f1: Give a persona step its actor instead of making it unwrap one

  `requireActor(scenarioStep)` was the first line of every step that acts as
  somebody, and it existed because the actor lived on the `scenarioStep` wire as
  an optional property. A property of a wire member is either optional for every
  binding or required for all of them, so the only expressible answer was
  "optional", and each step paid for it with a guard.

  The actor is now its own wire member, `wire.actor`, injected by the runner. Wire
  members can be required per binding, so a step declares whether it runs as
  somebody and the type follows:

  ```typescript
  export const buysAnApple = pikkuScenarioStep<
    { qty: number },
    { orderId: string }
  >({
    name: 'buysAnApple',
    actor: true,
    default: async (_services, { qty }, { actor }) =>
      actor.invoke('placeOrder', { qty }),
  })
  ```

  A `browser` binding implies it — a window is opened as somebody, so every
  binding of a step that has one gets the actor too. A step that declares neither
  has no `actor` on its wire at all, rather than an optional one: a pure assertion
  over what an earlier step returned has nobody to be, and `attemptsSignIn`
  deliberately posts credentials instead of reusing an actor's established
  session. That distinction is why the requirement is declared per step rather
  than inferred from the step being a persona step — "persona step ⇒ has an actor"
  is false, and a guard built on it rejects the 61 steps in the e2e suite that
  correctly run without one.

  Dispatching a step that declared an actor without `{ actor: actors.x }` now
  fails before the body runs, with `ScenarioActorRequired` naming the step.
  `ScenarioBrowserActorRequired` is replaced by it, and `requireActor` is gone
  from `@pikku/core/scenario` and the generated `#pikku/scenario` barrel.

- 9fce0f1: Say what a scenario step is actually given, and stop the skill teaching an RPC call that throws

  The `pikku-scenario` skill's two `default` witnesses destructured `rpc` from
  services and called `rpc.invoke`. That is exactly what the scenario runner
  refuses: steps run in the CLI process, and `guardRpc` answers every member with
  _"Scenario tried to run 'getOrder' as an internal step. Every workflow.do in a
  scenario must carry { actor: actors.x }"_. Both examples now go through
  `actor.invoke` off the step's wire, which is the path the surrounding prose
  already described.

  Adds a **What a step is given** section, because nothing said it. The services
  object is built by hand in `scenario.ts` and holds `logger`, `workflowService`,
  `workflowRunService` and — only when the project declares agents — `agentRunner`.
  There is no `kysely`, no `variables`, no `secrets` and none of the project's own
  services, so a step that destructures one gets `undefined` and fails on first
  use, which reads like a broken container and is not. The section names the three
  ways in (`invoke`, `invokeRaw`, a plain `fetch` at `env.apiUrl`), the two
  consequences that shape how steps get written, and the condition on
  `agentRunner` — `createDevAgentRunner` needs a base URL _and_ a key together, so
  a project with only `OPENAI_API_KEY` set gets `undefined` and every conversing
  scenario fails before the persona says anything.

  Adds **Declaring personas in TypeScript**, covering the one-call rule and the
  trap underneath it: `definePersonas` is read from source and never evaluated, so
  every value must be statically knowable — but only `name` is validated. A
  computed `personality` is dropped in silence and the persona runs with a blank
  temperament. `stringProperty` accepts `ts.isStringLiteralLike`, so a
  no-substitution template literal is read and is the way to write a long
  personality across several lines; a `+` concatenation is not. Also records that
  `actorInstructions` builds the conversing persona's prompt from `name`,
  `jobTitle`, `personality` and the scenario's `task` only — `disposition`,
  `goals` and `roles` are stored and shown but never reach it.

  Finally, the three `import ... from '#pikku/workflow/pikku-workflow-types.gen.js'`
  lines now point at `#pikku/scenarios/pikku-scenario-types.gen.js`, which is where
  the scenario surface moved when the barrel was split.

  Also corrects three import specifiers the skill still taught from before the
  `#pikku` leaves landed: `#pikku/scenarios/pikku-scenario-types.gen.js` and
  `@pikku/core/workflow` both become `#pikku/scenario`, which is the one door the
  leaf exists to be and the specifier every step file in the e2e suite already
  uses.

- 727671b: `wireAddon` and `wireRemoteAddon` move from `#pikku/function` to `#pikku/addon`.

  Installing an addon and authoring one are the same concept from opposite ends,
  so they are one import: an application's `#pikku/addon` carries the two install
  functions, an addon package's carries `pikkuAddonConfig`, `pikkuAddonServices`,
  `pikkuAddonWireServices` and `AddonBaseServices`.

  Two generation fixes came with it:

  - `CredentialsMap` is generated as a type alias rather than an interface. An
    interface has no implicit index signature, so it was never assignable to the
    `Record<string, unknown>` that `GetCredential` is constrained by, and every
    generated project reported two errors on its own function types.
  - An unresolved `SingletonServices` type is now `PKU724` instead of a services
    map with no entries in it. Written out, the empty map made every service
    optional and the real failure resurfaced as unrelated "possibly undefined"
    errors in files nobody had touched.

## 0.12.10

### Patch Changes

- 7406bfe: Rename the agent runtime from `AI*` to `Agent*` (#596)

  `AI` described the model provider, not the thing being named. Every symbol that
  belongs to the agent runtime now says `Agent`; the symbols that genuinely wrap a
  model provider — `AIEmbeddingService`, `AIProviderOptions`, `AIEmbedParams`,
  `AITranscriptionParams`, `AIGenerateImageParams` and their siblings, and the
  `@pikku/ai-vercel` / `@pikku/ai-deepinfra` / `@pikku/ai-voice` packages — keep
  their names.

  **Wiring**
  - `pikkuAIAgent` → `pikkuAgent`, `pikkuAIScorer` → `pikkuAgentScorer`,
    `pikkuAIJudge` → `pikkuAgentJudge`
  - `CoreAIAgent` → `CoreAgent`, `AIAgentInput` → `AgentInput`, `AIAgentStep` →
    `AgentStep`, `AIMessage` → `AgentMessage`, and the rest of the agent types
  - `AIAgentRunnerService` → `AgentRunnerService`, `AIStorageService` →
    `AgentStorageService`, `AIRunStateService` → `AgentRunStateService`

  **Entry points**

  `@pikku/core/agent` → `@pikku/core/agent`, `@pikku/core/agent-scorer` →
  `@pikku/core/agent-scorer`.

  **Queues**

  The scorer queues are now `agent-score-fast` and `agent-score-slow`. Drain the
  old `ai-score-fast` / `ai-score-slow` queues before deploying — jobs still
  sitting on them when the new workers start will never be picked up.

  **Scaffolds**

  The agent scaffold pikku wrote for your project — `<scaffold>/agent/agent.gen.ts`
  and its schemas file — imports `@pikku/core/ai-agent`, which no longer exists. A
  scaffold is normally written once and then left alone, so `pikku all` would find
  it present and leave the broken import in place. It now deletes an agent scaffold
  importing either removed entry point and regenerates it in the same run. Anything
  you added to that file goes with it, so move local edits out first.

  **Database**

  The agent tables are renamed: `ai_threads`, `ai_message`, `ai_tool_call`,
  `ai_working_memory`, `ai_run` and `ai_run_score` become `agent_threads`,
  `agent_message`, `agent_tool_call`, `agent_working_memory`, `agent_run` and
  `agent_run_score`, along with their indexes and the `ai_working_memory_pk`
  constraint. The same rename applies to the MongoDB collections.

  `ensurePikkuSchema` creates tables it cannot find, so an existing database will
  get empty `agent_*` tables and leave the old data stranded in `ai_*`. Rename
  them before the first boot on the new version:

  ```sql
  ALTER TABLE ai_threads        RENAME TO agent_threads;
  ALTER TABLE ai_message        RENAME TO agent_message;
  ALTER TABLE ai_tool_call      RENAME TO agent_tool_call;
  ALTER TABLE ai_working_memory RENAME TO agent_working_memory;
  ALTER TABLE ai_run            RENAME TO agent_run;
  ALTER TABLE ai_run_score      RENAME TO agent_run_score;
  ```

- e7e5319: Add `pikku semver`, which derives a release's semver from a diff against a deployed surface and writes `.pikku/changes.gen.json`

  A function or client-facing wiring that disappeared is major, an addition is minor, and a surface that did not move is patch. Where the generated JSON Schemas are available the verdict goes below the id level: a removed field or a newly required input field is breaking, an added optional one is not — direction-aware, so an output field going optional counts even though the same change on an input does not. `versions.pikku.json` is consumed, so a `@v2` bump does not read as a removal while v1 is still published.

  The baseline is `--against <path|url>`: another `.pikku` directory, a snapshot file, or a snapshot published by `pikku semver --emit`. `--fail-on <level>` turns the verdict into a CI gate.

- 411f89a: Add `pikku update`: report which `@pikku/*` dependencies can move forward, and which peers those versions need.

  Reporting only by default. `--update` writes the new ranges into every covered package.json — the project root plus every workspace it declares — and then runs an install with the package manager the project names (`--no-install` to skip). `--update-peers` additionally writes the ranges unsatisfied peers require; it is separate because a peer bump can cross a major of a third-party package.

  Peers are read off the version the run lands on rather than the one installed, so an update that needs a companion bump says so before it is applied. Ranges that cannot be substituted into (`workspace:*`, `file:`, unions, x-ranges) are reported and left alone, and a package the registry could not answer for is reported as unresolved rather than current.

## 0.12.9

### Patch Changes

- b5fa1e5: Enumerate addon secret and credential grants in the deployment manifest.

  `wireAddon`'s `secretGrants` / `credentialGrants` widen an addon's scope the same
  way `globalSecrets` does, only narrower — but the manifest reported the exemption
  and not the grant, so a deployment could not see the secrets an app had lent an
  addon. `grantedSecretAddons` and `grantedCredentialAddons` now list them by name,
  including override keys, since scoping is checked before an override renames.

  The `pikku-addon` skill documents the whole grant family and the scoping rule
  behind it, rather than the override fields alone.

## 0.12.8

### Patch Changes

- 0ab1a88: feat(knowledge): draw a note's scenario and its decision, and say the vocabulary exists

  The console already drew ```mermaid fences as diagrams and `> [!NOTE]` blocks as
  callouts, and nothing told the librarian either existed — the skill that governs
  what goes in a note never mentioned them, so notes were written as prose and
  tables into a renderer that would happily have drawn the graph. The gap was the
  guidance, not the format.

  Two blocks join them. A slice's ```gherkin scenario is drawn rather than
  highlighted: the keywords line up in a column so the shape of the scenario is
  readable before a word of it is, and each quoted persona becomes a chip — which
  also makes a first-person scenario, the form the format rejects, visibly a block
  with no personas in it.

  A new ```decision fence states what a decision note owes: `chosen`, `rules-out`,
  `because`. The middle one is the half that gets dropped, so `pikku knowledge
validate` now warns when a fence says what was chosen and never says what it
  closes off. The fence is optional and a decision argued in prose is still a
  decision — validate checks the fences that exist rather than asking every note
  to be reformatted.

  `Markdown` is exported from `@pikku/console` so the fabric console can render the
  same notes through the same vocabulary instead of a second `<ReactMarkdown>`.

- 8978fbd: feat(workflow): let an approval gate declare who may answer it

  `workflow.approval()` gains `approvers` (`'any' | 'owner' | 'not-initiator'`)
  and `approverScope`, so a gate can require four-eyes sign-off, restrict itself
  to the run's initiator, or require the decider to hold a named scope.

  Both are enforced when the workflow replays the gate — the same place, and for
  the same reason, the decision payload is validated: the policy is a value on
  the workflow, and a decision can be recorded before the run has ever reached
  the gate. A decision that fails the policy is discarded and the gate stays
  closed. Where the run has already published its policy, the check also runs at
  submission time so the caller gets a 403 rather than silence.

  An answer is now recorded where it can be answered for later. The settled
  decision carries `decidedBy` and `decidedAt` in its `ApprovalOutcome`, so who
  signed reaches `workflowStep.result` and `workflowStepHistory` rather than
  living only in mutable run state. Every answer — accepted, refused at the door,
  or cleared on replay — is also written to the audit sink as
  `workflow.approval.decided`, which outlives the run: `deleteRun` cascades to
  steps and history, and a refused attempt never reaches a step at all. Projects
  with no audit service wired are unaffected.

  **This loosens the default.** `approveStep` previously refused anyone but the
  run's initiator, unconditionally. A gate that declares no `approvers` now
  accepts a decision from anyone the approve entrypoint admits — restore the old
  behaviour per-gate with `approvers: 'owner'`, or gate the approve route with
  `auth`/`permissions`. Ownership still governs _reads_ of a run unchanged.

## 0.12.7

### Patch Changes

- e110c55: Add `scenario.expectScore` — grade a finished agent run with a declared scorer and assert on it.

  An agent's answer cannot be matched against a fixed string, so a scenario grades
  it instead. `expectScore(step, runId, scorer, { atLeast, atMost, reference })`
  runs one declared scorer against the run the scenario just triggered and fails
  with the reason the judge gave. The default bound is `atLeast: 0.5`, so an
  unqualified assertion still fails a run graded zero.

  Grading goes over the new `pikkuScenarioGradeRun` instrumentation RPC, which the
  dev server registers alongside the coverage and stub RPCs — so it exists only in
  processes that should have it, and never in a deployed bundle. It grades from
  the snapshot the runtime already took when the run finished, which is what makes
  a scenario's grade the same measurement production's sampler makes rather than
  an approximation of it: a run's prompt, answer and tool calls are spread across
  a thread's messages, where the boundary of one run is not recoverable.

  Two things differ deliberately from live scoring. The sample rate is ignored — a
  scorer grading 1% of traffic still grades every scenario run — and the grade is
  returned rather than recorded, so a test's score never lands among the
  production figures. `reference` supplies the answer key a `requiresReference`
  judge grades against, which is the only way such a judge is reachable at all.

- 2f15aad: `pikku workspace validate` is now `pikku validate`, and it checks addon packaging

  The command no longer needs to be told what kind of project it is looking at.
  Each check declares the condition under which it means anything and runs
  wherever that condition holds, so a repo that is an app, a pile of publishable
  addons, or both gets exactly the checks that apply — and a run that found
  nothing to check says so instead of printing a tick.

  The new checks are for addons, and both state the same property at a different
  level: every relative import in a shipped generated file, and every `exports` or
  `imports` target, must resolve to a file the package actually publishes.

  That property was false in every published `@pikku/addon-*`. They shipped
  `dist/.pikku` without the `types/application-types.d.ts` those files import —
  14 typecheck errors inside `node_modules` for any app depending on one — and
  they published a second, dead copy of `.pikku` at the root whose imports reached
  for a `src/` and `types/` the tarball did not contain, behind the very subpath
  consumers import their bootstrap through.

  Addons now point every entry point at the built copy under `dist`; the addon's
  own build resolves `#pikku` through tsconfig `paths`, so nothing has to reach
  into the source tree. `pikku new-addon` scaffolds that shape, and the addon
  skill teaches it.

## 0.12.6

### Patch Changes

- 2ff07e0: Remove `pikku db seed`. Seeding is now a step of `pikku db reset`, which grew `--no-seed`.

  `seed` read like something you might point at any environment. It never was. It exists
  for one job: put enough test data into a **dev** database that the app isn't empty on
  first run. Production and staging are provisioned, not seeded — accounts and their role
  grants come from `pikku persona sync` or a migration, and always have.

  A standalone seed command is also what made seed files unpleasant to write. Because it
  could be run against a database in any state, every seed had to defend itself with
  `INSERT OR IGNORE`, `ON CONFLICT DO NOTHING`, `IF NOT EXISTS`. Folding it into reset
  removes that: `pikku db reset` wipes, migrates, then seeds, so the seed only ever meets
  an empty database and **plain `INSERT`s are correct**. The guarantee is structural now
  rather than a documented convention.

  ```bash
  pikku db reset             # wipe + migrate + test data
  pikku db reset --no-seed   # wipe + migrate, empty — for empty-state and onboarding work
  ```

  Seeding also inherits reset's guards for free: it refuses `NODE_ENV=production`, and
  refuses a database resolved outside the runtime directory.

  The seed file keeps a name that says what it is:
  - `db/postgres-seed.sql` → `db/postgres-dev-seed.sql`
  - `db/sqlite-seed.sql` → `db/sqlite-dev-seed.sql`

  **Migrating:** rename the file, and drop the idempotency guards from it if you like.
  `pikku db seed` no longer exists — use `pikku db reset`. A project that keeps the old
  filename gets no error: reset reports the database is empty, which is the one failure
  mode worth knowing about up front. The Fabric validator's `seed-sql-missing` finding is
  now `dev-seed-sql-missing` and looks for the new name.

- 1e74b01: Remove `pikku db seed`. Seeding is now a step of `pikku db reset`, which grew `--no-seed`.

  `seed` read like something you might point at any environment. It never was. It exists
  for one job: put enough test data into a **dev** database that the app isn't empty on
  first run. Production and staging are provisioned, not seeded — accounts and their role
  grants come from `pikku persona sync` or a migration, and always have.

  A standalone seed command is also what made seed files unpleasant to write. Because it
  could be run against a database in any state, every seed had to defend itself with
  `INSERT OR IGNORE`, `ON CONFLICT DO NOTHING`, `IF NOT EXISTS`. Folding it into reset
  removes that: `pikku db reset` wipes, migrates, then seeds, so the seed only ever meets
  an empty database and **plain `INSERT`s are correct**. The guarantee is structural now
  rather than a documented convention.

  ```bash
  pikku db reset             # wipe + migrate + test data
  pikku db reset --no-seed   # wipe + migrate, empty — for empty-state and onboarding work
  ```

  Seeding also inherits reset's guards for free: it refuses `NODE_ENV=production`, and
  refuses a database resolved outside the runtime directory.

  The seed file keeps a name that says what it is:
  - `db/postgres-seed.sql` → `db/postgres-dev-seed.sql`
  - `db/sqlite-seed.sql` → `db/sqlite-dev-seed.sql`

  **Migrating:** rename the file, and drop the idempotency guards from it if you like.
  `pikku db seed` no longer exists — use `pikku db reset`. A project that keeps the old
  filename gets no error: reset reports the database is empty, which is the one failure
  mode worth knowing about up front. The Fabric validator's `seed-sql-missing` finding is
  now `dev-seed-sql-missing` and looks for the new name.

- 95f6144: Audit the twelve core skills against the shipped APIs and correct the drift.
  - pikku-ai-agent: `instructions` does not exist — the prompt is `role`/`personality`/`goal` (required); tools are `ref()` handles; import from `#pikku/agent/pikku-agent-types.gen.js`; invoke via `rpc.agent.*` rather than `runAIAgent(name, input, { singletonServices })`
  - pikku-scenario: step bodies live under `default`/`browser`/`cli` bindings, not a `func`; `scaffold.scenarios` is a boolean, not the rejected `"auth"` string
  - pikku-addon: there is no `addon()` helper — `ref()` covers local and addon functions
  - pikku-realtime: SSE is `PikkuRealtime.subscribeToTopic`; `publish`'s channelId argument excludes rather than targets
  - pikku-cli: factories come from `#pikku`; documents options parsing, permissions/middleware/auth and the generated websocket backend
  - pikku-services, pikku-config, pikku-middleware, pikku-rpc, pikku-workflow, pikku-queue, pikku-cron, pikku-websocket: corrected option names, wire objects, scopes/secrets coverage and cross-skill routing

- facd61f: Audit the remaining skills against the shipped APIs and correct the drift.
  - pikku-mcp: there is no `wireMCPTool` — a tool _is_ the function (`mcp: true` or `pikkuMCPToolFunc`), while `uri`/`title`/`name` belong on `wireMCPResource`/`wireMCPPrompt` rather than on the `pikkuMCP*Func` factories; resources return `{ uri, text }` only; `PikkuMCPServer` takes `(config, logger)`
  - pikku-http: `channel` is on the wire, not services; `sse` is `get`-only and `query` is `post`-only; `docs` was never a `wireHTTP` option; factories come from `#pikku`
  - pikku-security: documents `authBearer`'s static-token mode, `authCookie`'s merged defaults and re-issue rule, and that every strategy is a no-op without an HTTP request or with a session already set
  - pikku-better-auth: the `admin:users:*` scope tree gained create/ban/remove/sessions/password, and `syncProjectedAdminRole` projects them onto `user.role` for better-auth's own `admin()` endpoints; documents dev quick login
  - pikku-react / pikku-react-query / pikku-workflows-client: `createPikku` options are flat `CorePikkuFetchOptions` with `authHeaders` and the `setAuthorizationJWT`/`setAPIKey`/`setHeader` setters (no request interceptor); `useWorkflowStatus` never stops polling on its own
  - pikku-trigger: a source function runs once at startup with singleton services only; documents `InMemoryTriggerService` startup and the skipped-metadata warning
  - pikku-schedule: the singleton is `schedulerService` and `start()` is what registers the cron jobs; documents `scheduleRPC` and the one-off task API
  - pikku-ws: there is no `PikkuWSServer` — `pikkuWebsocketHandler({ server, wss, logger })` over a `noServer: true` `WebSocketServer` is the real API
  - pikku-info: there are only four subcommands, and `--silent` works despite the spurious "Unknown option" warning
  - pikku-versioning: `override` is not required — a matching `V<n>` export suffix is stripped automatically — and the live function must be bumped explicitly; `versions init` writes an empty manifest, so `versions update` has to follow it
  - pikku-audit: documents `audit: { durability }`, the `Safe<>` guard on `auditLog.write`, `createInvocationAudit`'s logger argument, and `createAuditedKysely`'s options
  - pikku-kysely: six packages, not four — `@pikku/kysely-node-sqlite` / `-bun-sqlite` build the instance functions query, while `createSQLiteKysely` is typed to `KyselyPikkuDB` and wires `SerializePlugin`; the secret service config is `{ key, keyVersion, previousKey, audit }`, not `{ kekSecret, salt }`, and `getSecret` returns a `SecretValue`
  - pikku-emails: template variables are always optional and never required-able; unresolved placeholders render blank rather than failing; documents `pikku emails init`
  - pikku-rtl: rewritten off i18next — there is no `t()` or `i18n.changeLanguage` anywhere in the repo; Arabic is a `messages/ar.json` listed in `project.inlang/settings.json`
  - pikku-i18n: enum labels use the singular `enum__<group>__<member>` namespace `@pikku/paraglide` generates from, not hand-written `enums__` maps; notes the console's wrapped `m` as a leftover rather than a pattern, and that the `mKey`/`mList` runtime resolvers have been removed for good
  - pikku-deps: the summary has `totalIssues`/`totalUpdates` and no `info` bucket, issue `url`/`cvssScore`/`recommendedVersion` are nullable rather than optional, lockfile detection covers pnpm and npm too, and a non-zero `bun audit` exit only counts as data when it produced output
  - pikku-feature: stage changed files by path — `git add -A` sweeps up regenerated artifacts and, on a shared checkout, another agent's work
  - pikku-jose: `decode` verifies the signature and expiry (it is not an unchecked read), keys resolve by the token's `kid` rather than being tried in turn, and the algorithm is fixed HS256
  - pikku-machine-auth: documents restricting a key below its owner via `scopes` on the mapped session, the deliberate verify-vs-scope failure split, and that `betterAuthStatelessSession` has no api-key path
  - pikku-redis / pikku-mongodb: the secret-service config is `{ key, keyVersion, previousKey, … }`, not the fabricated `{ kekSecret, salt }`; both packages also ship a `SessionStore`
  - pikku-pino: log methods take trailing meta varargs and are `Safe<>`-guarded against secrets; `debug` takes a string only
  - pikku-aws / pikku-backblaze: every `ContentService` method takes an args object with a logical `bucket` stored as a path prefix, not positional arguments; `S3ContentConfig` is `{ bucketName, region, endpoint }` and `B2ContentConfig` has no `cdnUrl`; documents `signURL` failing open, the fixed 3600s presign, SQS's 900s delay ceiling and throwing `getJob`, and that `AWSSecrets.getSecret` returns a `SecretValue` and reports every failure as the same fatal error
  - pikku-gateway-slack: `SlackGatewayAdapter` takes `{ signingSecret, tokenResolver }` — there is no `botToken`, one adapter serves every workspace; `verifySlackSignature` is `(secret, signature, timestamp, body)` and returns a boolean; `parseSlashCommand` returns camelCase fields with the raw payload on `raw`; the generic `send()` is a no-op, so replies must go through `createBoundSend`/`SlackGatewayHelper`
  - pikku-ai-vercel: model strings are `provider/model`, not `provider:model`; documents the `'*'` catch-all, `withApiKey`, the transcribe/speech/image/embed methods, and that the service key must be `aiAgentRunner`
  - pikku-ai-voice: rewritten — `@pikku/ai-voice` is a deprecated empty package with no `STTService`/`TTSService`; `voiceInput`/`voiceOutput` come from `@pikku/core/ai-agent` and attach via `aiMiddleware`, with per-script voices, `NoSpeechDetectedError`, and speak-only-when-spoken-to
  - both above: there is no `wireAIAgent` — agents are declared with `pikkuAIAgent` from the generated agent types
  - pikku-schema-ajv / pikku-schema-cfworker: the two validators are not drop-in equivalents — AJV caches by name forever and fills defaults in place, cfworker recompiles on a changed schema and applies no defaults; a missing schema throws a bare string rather than an `Error`
  - pikku-n8n-import: the output directory is `--out/-o`, not a positional argument, and `pikku import n8n` already accepts a directory and flattens array/`{workflows:[]}` exports — an un-importable workflow is skipped while the rest of a batch still imports
  - pikku-template-clone: `create-pikku` keeps only the chosen package manager's lockfile and may have written an empty `yarn.lock`, so commit it after the first install rather than as scaffolded
  - pikku-fabric: the wirings file comment claimed a `wireMCPTool` that has never existed, and the conversion checklist named `fabric.config.json` with a `production.branch` — the real file is `pikkufabric.config.json` with `production.domain`; notes that several CLI messages print the shorter name anyway
  - pikku-fabric-debug: `metrics` also requires `--branch`, and `--follow`'s own help text advertises SSE for what is a 2-second client poll
  - pikku-deploy-express: documents `getHttpServer`/`enableReaper`, that the health check is registered in the constructor (before any middleware, so it cannot be wrapped in auth), what `init()` installs and in what order, and that Express buffers the body so the parser limit is the only place `maxBodySize` can stop an oversized request
  - pikku-deploy-fastify: `enableCors` throws `Method not implemented.`; the health check lives in `init()`, not the constructor; the plugin registers a catch-all `fastify.all('/*')` and only sets `bodyLimit` when `maxBodySize` is supplied, so Fastify's stricter 1MB default otherwise stands
  - pikku-deploy-uws: `PikkuUWSServer` has no `enableCors`, static assets or `content`; `init()` registers the health check plus catch-all HTTP and websocket handlers, `httpOptions` never reaches the websocket one and `loadSchemas` is never passed; `stop()` throws a bare string and waits a fixed 2s; documents the byte-counting `maxBodySize` 413 and why `@pikku/ws` needs `noServer: true`
  - pikku-deploy-lambda: `runFetch` is payload v1 and `runFetchV2` v2 — only v2 echoes an origin or returns a 500; scheduled handlers should use `runLambdaScheduled`, which runs every task in the bundle and swallows per-task failures; the SQS worker's `batchItemFailures` needs `ReportBatchItemFailures` to mean anything; websocket handlers return a real `APIGatewayProxyResult` that must not be replaced with a hardcoded 200; documents the handler factories, `SQS_QUEUE_URL_*` resolution and the binary-unsupported/stale-connection eventhub behaviour
  - pikku-deploy-cloudflare: the hand-rolled `setup-services.ts` never called `setSingletonServices`, so every request would have thrown a CF 1101 — use the exported `setupServices(env, factories)` and the handler factories; documents `runFetch`'s 426 upgrade path, `cf-ray` traceId and `exposeErrors: false` default, that `runScheduled` stops after the first cron match, and the `WEBSOCKET_HIBERNATION_SERVER` binding plus the 1008/403 connect-denial path
  - pikku-deploy-nextjs: `pikkuAPIRequest` strips a leading `/api` (toggle with `removeAPIPrefix`) and passes no wiring options; the helper set includes `patch` and has no `staticPatch`/`staticDel`; the static variants differ by `skipUserSession`, not just where they run, and both bubble errors; documents `PikkuNextJSWorkerRPC` and `toNextJsAuthHandler`
  - pikku-deploy-azure: the exports are `AzInvocationLogger` and `PikkuAZTimerRequest` — `PikkuAzFunctionsLogger` never existed; real deployments go through `createAzureHandler(factories, handlerTypes)` returning `{ http, queue, timer }`; `createAzureWebSocketHandler` is a 501 stub; documents the text-flattened HTTP response, `AZURE_QUEUE_NAME_*` resolution, the 7-day visibility cap, the timer running every task without per-task error handling, and `setLevel` being a no-op
  - pikku-product-second-opinion: stop asserting a fixed TanStack Start release stage — `@tanstack/react-start`'s major tracks the Router line, so the version says nothing about maturity; check the vendor at write-up time

- 2f72189: Point the `versions check` hints at a command that exists.

  Three different failures told you to run `npx pikku versions-update`. There is
  no such command — `update` is a subcommand of `versions` — so anyone following
  the hint hit "unknown command" at the moment they were trying to repair a
  contract manifest. It now prints `npx pikku versions update`.

  The pikku-versioning skill carried a paragraph warning agents the hint was
  wrong; with the hint fixed, that warning is gone.

- 7b0da5e: Point `versions check` at a command that exists.

  Three of its diagnostics told you to run `npx pikku versions-update`. There is
  no such command — `update` is a subcommand of `versions`, so following the hint
  gets an unknown-command error at the exact moment you have a failing check to
  clear. They now print `npx pikku versions update`.

  The pikku-versioning skill carried a paragraph warning agents off the bad hint.
  With the hint corrected the warning is the only thing left naming a command that
  does not exist, so it goes too.

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
