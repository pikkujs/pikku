## 0.12.60

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

- 6794681: Publish the ecosystem surface as per-area sub-barrels under `@pikku/core/ecosystem/*`, and point generated code, the CLI, the inspector and the runtime adapters at them.

  348 names that only generated code, the toolchain or a runtime adapter ever imports now have a second home on `@pikku/core/ecosystem/<area>` — one sub-barrel per area, matching how core already publishes its entrypoints, so no single barrel grows without bound and a consumer only pulls in the area it uses.

  This step is additive: every name is still exported from the entrypoint it was published from before, so nothing downstream breaks. Removing them from the app-facing barrels is a later change, and needs a release carrying `./ecosystem/*` first.

- Updated dependencies [7406bfe]
- Updated dependencies [6794681]
  - @pikku/core@0.12.84

## 0.12.59

### Patch Changes

- 02c4fe5: fix(core,inspector): let a host grant an addon secrets it could not declare

  Scoping an addon's `SecretService` to its `declaredSecrets` left generic addons
  with nothing readable: `declaredSecrets` is derived from the addon package's own
  source, but the secrets an addon like `@pikku/addon-graph` reads are named by the
  consuming app's workflow nodes at runtime. Every authenticated `graph:httpRequest`
  threw.

  `wireAddon` now takes `secretGrants: string[]` and `credentialGrants: string[]`,
  completing the grant family alongside `secretOverrides` (grant + rename) and
  `globalSecrets` (grant everything, with a reason). Grants name the secret as the
  addon reads it, since the scope check runs before the override map renames it —
  which is also why an override's key grants and its value does not.

  A grant naming a secret the project does not declare is an `INVALID_VALUE`
  critical at codegen, resolved through the override map before lookup.

- 438b776: Move the scenario and feature surface off `@pikku/core/workflow` and onto
  `@pikku/core/scenario`. Scenarios extend workflows, so the production workflow
  wiring no longer names a scenario module in its import graph. Feature and
  scenario types are declared in their own `scenario.types.ts` rather than in
  `workflow.types.ts`. Import `requireActor`, `requireScenarioEnv`, `pollUntil`,
  `createCookieJar`, `addFeature`, `ScenarioHttpResponse` and the rest from
  `@pikku/core/scenario`; `HttpPersonasConfig` now comes from
  `@pikku/core/persona` rather than `@pikku/core/services`.
- ad63f47: feat(cli): warn before codegen when a linked dependency splits a package's type identity

  `pikku all` now runs the split-type-identity check as a preflight, beside the
  existing `@pikku/core` one, and warns with `PKU719` naming each package, both
  versions and both paths.

  It has to run _before_ the work rather than after it fails. The failure it
  explains is a V8 heap OOM, which aborts the process — `process.on('exit')`,
  `uncaughtException` and `finally` never run, so nothing printed after the fact is
  ever seen. By the time there is a symptom, the only thing that can help is
  already on screen above it. Without this the user sees a codegen step that dies
  of memory pressure with no indication that two copies of one package are the
  reason, and the obvious next move is to raise `--max-old-space-size`, which
  hides it further.

  Warns rather than throws: a skewed linked dependency is a strong signal, not a
  certainty, and refusing to build on a heuristic would break working setups.
  `PIKKU_SKIP_TYPE_IDENTITY_CHECK=1` silences it, matching
  `PIKKU_ALLOW_DUPLICATE_CORE`. It also swallows its own errors — it runs on every
  codegen, so it must never be the reason a build stops.

- Updated dependencies [02c4fe5]
- Updated dependencies [438b776]
- Updated dependencies [438b776]
  - @pikku/core@0.12.83

## 0.12.58

### Patch Changes

- 3ad2131: Name models by what they are for, and switch them all in one place

  A `models` table in pikku.config.json maps an alias to a provider-qualified
  model, so a declaration can say `model: 'cheap'` and the project repoints every
  use of that tier at once instead of editing each agent. A model containing `/`
  is still concrete and used exactly as written, which is how an agent that needs
  one specific model pins it — aliases are opt-in.

  The table is baked into codegen rather than read at runtime, so it applies to
  deployed units and not just local runs, and `pikku dev`/`pikku serve` take
  `--model cheap:openai/gpt-5-nano` to repoint a tier for one run without editing
  the config.

  Because the inspector already holds every agent's model literal, a bare name
  with no matching alias now fails the build (PKU146) naming the aliases that do
  exist, rather than reaching a provider as an unknown model.

  Aliases resolve for every modality, not just agents: image, speech,
  transcription, embedding and reranking all reach a provider through the same
  point in the Vercel runner.

- b930dca: Remove the `secretBroker` escape hatch and scope addon secrets and credentials

  `secretBroker` let three named console functions receive the real `SecretService`,
  against the rule that a function never sees one. It is gone: the inspector allowlist,
  the `FunctionRuntimeMeta` flag, the runner branches, and the `WiredSecretBrokerServices`
  type. Console secret administration moved into the console addon, where a
  `SecretAdminService` holds the `SecretService` and the functions hold none.

  Addons are now scoped rather than trusted. The CLI emits each package's declared secret
  keys, and the host wraps the `SecretService` in a `ScopedSecretService` and the
  `CredentialService` in a new `ScopedCredentialService` before the addon's service factory
  runs — so an addon reads only what it declared, cannot write secrets, and cannot enumerate
  the app's users. `wireAddon({ globalSecrets, globalCredentials })` waives this, taking the
  reason as its value; only the consuming app can grant it, and the deploy manifest reports
  every grant under `unscopedSecretAddons` / `unscopedCredentialAddons`.

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

- Updated dependencies [063f43a]
- Updated dependencies [ce66bf8]
- Updated dependencies [d0307a8]
- Updated dependencies [ce66bf8]
- Updated dependencies [3ad2131]
- Updated dependencies [b930dca]
- Updated dependencies [b95e77d]
- Updated dependencies [fd9d834]
- Updated dependencies [8978fbd]
  - @pikku/core@0.12.82

## 0.12.57

### Patch Changes

- e110c55: Wire `pikkuAIScorer` / `pikkuAIJudge` through the inspector and codegen, and let an agent name the scorers that grade it.

  The inspector reads a scorer's lane off which constructor was called rather than
  off a field, so the two lanes cannot disagree with the code that produced them,
  and refuses a scorer with no name or description — the meta is the only thing
  that names it at runtime. An agent naming a scorer that was never declared is a
  build error (`PKU155`) rather than an agent that quietly grades nothing forever.

  Codegen emits a `ScorerName` union, so `scorers` on an agent is checked against
  the scorers the project actually declares, plus the scorer wirings and meta.
  `pikku validate` now also flags a scorer declared outside a `*.scorer.ts` file,
  for the same reason scenarios have to live in files named for them: a rubric
  buried in an agent definition is one nobody reviews as a rubric.

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

- Updated dependencies [e110c55]
- Updated dependencies [e110c55]
- Updated dependencies [e110c55]
- Updated dependencies [acc8077]
- Updated dependencies [905f737]
- Updated dependencies [3cc6428]
- Updated dependencies [c524adf]
- Updated dependencies [e110c55]
  - @pikku/core@0.12.81

## 0.12.56

### Patch Changes

- 7e60867: Delete exports nothing references

  A sweep of the `@pikku/core` surface for exports with no consumer anywhere in the repo — no package, template, verifier or e2e project imports them: `ExtractFunctionOutput`, `CLICommandDefinition`, `RequestHeaders`, `HTTPFunctionsMeta`, `HTTPWiringMiddleware`, `JsonRpcError`, `TriggerSourceInfo`, `getMCPResources`, `getMCPPrompts`, `onGraphNodeComplete` and `InputRef`.

  Every one was a compatibility promise with nothing on the other end of it. Removing them narrows what 0.13 has to keep stable.

  `isRef` looked like the twelfth, and isn't. It is the type guard that reads what `createRef` writes — the `__isRef` brand marking a graph node input as "substitute another node's output here". Nothing imported it because neither it nor `RefValue` was reachable from any entry point, so the one consumer that needed it, the inspector's graph serializer, had reimplemented the same four conditions privately as `isRefValue` along with its own structural copy of `RefValue`. Deleting `isRef` would have made that duplicate permanent, with the brand's shape asserted in two places free to drift apart.

  So `isRef` and `RefValue` are exported from `@pikku/core/workflow` instead, and the inspector imports them rather than keeping its own copy.

- a879ab3: **Codegen reports a schema it named but never generated (PKU463).** A named
  contract type that is declared but not exported is imported by the virtual
  source file the schema generator compiles, resolves to nothing, and yields no
  schema — while the function meta still carries the name. `pikku all` exited 0
  and the first call to that function failed in a deployment with
  `MissingSchemaError`. The reference is now checked once addon schemas are
  merged, since an addon supplies its own and checking earlier would report every
  one of them as unresolved.
- Updated dependencies [41c1a95]
- Updated dependencies [ce96383]
- Updated dependencies [7e60867]
- Updated dependencies [f8f1244]
- Updated dependencies [dcf20cb]
- Updated dependencies [6512384]
- Updated dependencies [e3b4c14]
- Updated dependencies [efd0ed1]
- Updated dependencies [cba98fb]
- Updated dependencies [ce96383]
- Updated dependencies [f8f1244]
- Updated dependencies [f8f1244]
- Updated dependencies [6e93a35]
- Updated dependencies [6dada45]
  - @pikku/core@0.12.80

## 0.12.55

### Patch Changes

- ae4e898: Carry a secret's `allowedHosts` through code generation, and close three gaps in
  the SSRF guard.

  `allowedHosts` was declared and enforced but never survived codegen: the
  inspector did not read the property off the `defineSecret` literal, and the meta
  builder rebuilt its objects without it. Enforcement in `assertSecretAllowedForHost`
  then always saw `undefined`, so the egress restriction was a no-op by default —
  and, with `secrets.requireAllowedHosts` set, threw for every secret including the
  ones that correctly declared hosts. Both stages now carry the field, and the
  secrets verifier asserts it against the generated JSON rather than a hand-written
  meta literal, which is why the existing tests stayed green.

  `isPrivateHost` now checks an explicit CIDR table instead of ad-hoc octet
  comparisons. It previously missed `100.64.0.0/10` — which contains Alibaba
  Cloud's `100.100.100.200` metadata endpoint — along with `192.0.0.0/24`,
  `198.18.0.0/15`, `192.88.99.0/24`, the TEST-NETs, multicast and reserved space.
  IPv6 gains a real parser, so `fec0::/10`, `ff00::/8`, and NAT64 (`64:ff9b::/96`)
  and 6to4 (`2002::/16`) forms wrapping an internal IPv4 address are caught.

  `safeFetch` takes an optional `resolveHost`, checked on the initial URL and every
  redirect hop, so a _public_ hostname pointing at a private address is refused —
  the `169-254-169-254.nip.io` shape a literal-only check cannot see. Core cannot
  resolve DNS itself (Workers has no DNS API), so the Node resolver ships as
  `@pikku/core/node-host-resolver` and the Node server runtimes install it during
  `init()`. The connection is not pinned to the address that was checked, so a
  rebind between check and connect is still possible.

  The graph addon's `httpRequest` node called bare `fetch`, bypassing the guard
  entirely; it now goes through `safeFetch`.

- Updated dependencies [e848eb2]
- Updated dependencies [b170489]
- Updated dependencies [ae4e898]
  - @pikku/core@0.12.79

## 0.12.54

### Patch Changes

- 62ea4cc: The audit trail is now readable — in the generated meta, through an RPC, and as
  a page in the console.

  `audit: true` reaches `FunctionRuntimeMeta.audit` as its resolved form
  (`{ durability }`), so which functions record anything is answerable without
  running them. It is informational: the runner still resolves audit from the live
  function config, so meta and runtime cannot disagree.

  `AuditService` grows an optional read side — `query(AuditQuery)` and `facets()`.
  Optional because a sink can legitimately be write-only: a queue producer that
  hands events to another system has nothing to read back, and a reader that finds
  these absent should say the trail is not readable here rather than that it is
  empty. The two are very different answers to give someone auditing a system.

  `KyselyAuditService` implements both, newest first with offset paging, filtered
  by user, action and time window. Two things it now gets right that are easy to
  get wrong: an empty filter array means "match nothing" rather than "no filter",
  and results are read by physical _and_ camelCase key, because `CamelCasePlugin`
  is on most pikku Kysely instances and renames result keys on the way out — the
  mismatch does not throw, it returns a page of `undefined`. `init()` creates the
  `audit` table for projects that do not migrate it themselves, from a new
  exported `auditSchema` that stays out of `pikkuSchemas` because the runtime does
  not need it.

  The console addon exposes `console:getAudits` and `console:getAuditFilters`
  behind a new `pikku:audit:read` scope, and forwards the application's `audit`
  service into the addon's own services — without that last part every install
  reported the trail as unreadable, whatever sink it had configured.

  The console gets an Audit trail page: an infinite list filtered server-side by
  user and action, and a row that opens the whole event, metadata rendered as a
  JSON tree. Refused, unreadable and empty are three different screens, because
  "you may not read this", "nobody can read this" and "nothing happened" are three
  different facts.

  Events name the person who caused them. The trail records a user id — the only
  thing stable enough to record, since a name can change after the event — so
  `getAudits` resolves those ids against better-auth's user directory at read
  time, and the page shows the name while keeping the recorded id on the event.
  The filter follows: pick a colleague by name, filter by the id. A scenario
  actor is labelled as one, so synthetic traffic is not mistaken for real, and a
  caller who was signed out shows the wire identity pikku resolved for them
  rather than being credited to the system.

  **Breaking, for anyone already reading `AuditEvent`:** `actor` is now
  `userIdentity`, and its type `AuditActor` is `AuditUserIdentity`; `AuditQuery`
  takes `userIds`/`orgId` in place of `actorUserIds`/`actorOrgId`, and
  `AuditFacets` returns `userIds`. In pikku an _actor_ is a synthetic person a
  scenario drives, flagged on the user row — so naming the causer of an event
  `actor` made the synthetic case unsayable (`actor.actor === true`) and implied
  every recorded action was a test. The overwhelming majority are ordinary
  customers. The `audit` table follows: `actor_user_id` / `actor_org_id`
  are now `user_id` / `org_id`, and a `pikku_user_id` column joins them so the
  wire identity of a caller who never signed in survives the round trip — the
  sink was dropping it, which left the console's Session field permanently
  blank. A project that already migrated the table needs to rename the two
  columns and add the third; `KyselyAuditService.init()` creates the new shape
  for anyone who did not.

- 9dddff8: Split a column's at-rest form out of its classification.

  `security: 'encrypted'` sat beside `'secret'` as though the two were
  alternatives, which made the field unanswerable: a token hash and a live bearer
  token are both secret, one must never be encrypted — the digest _is_ the lookup
  key — and the other must always be. A column now carries a second, independent
  `form: 'plain' | 'hashed' | 'wrapped' | 'sealed'` saying how the bytes are held.

  Declaring a form other than `plain` makes the column's INSERT/UPDATE type
  nominal — `WrappedValue`, `SealedValue`, `HashedValue` — so a plain string no
  longer compiles there and the only way to write the column is with something an
  encrypt, seal or hash call produced. `envelopeEncrypt`, `envelopeRewrap` and
  `wrapDEK` now return the brand, and a new `hashToken` produces `HashedValue`, so
  the round trip needs no casts; `column-form.ts` exports deliberately-named
  `unsafeAs*` assertions for backfills, fixtures and values sealed elsewhere.
  Reads are unaffected — the brands widen to `string` and compose with the
  classification brand as `Secret<WrappedValue>`.

  `wrapped` and `sealed` stay distinct because a sealed value is one the
  application cannot read back; storing one where the other belongs is a row
  nobody can open.

  A `secret` column that has not declared a form now warns (PKU483), and a form on
  a non-text column warns and is dropped (PKU484). Both are warnings, so existing
  projects keep migrating — `pikku db --fail-on-warn` opts into the ratchet, and
  an explicit `form: 'plain'` is the acknowledgement that silences it. The legacy
  `security: 'encrypted'` keeps working and now expands to the pair it always
  meant, `secret` + `wrapped`.

- 9dddff8: Read schema-qualified annotations, and let a project name its default schema.

  `DbClassificationMap` nests tables under their schema whenever a project sets
  `db.schema`, but `loadAnnotations` read the sidecar as a flat table→column map.
  It therefore took the schema for a table and each table for a column, found no
  recognised fields, and dropped every annotation on the floor — so a project
  could mark a column `secret` and watch it generate as `private`, with no error
  anywhere. The parser now detects the extra level (a column entry's values are
  primitives; a table's are objects) and flattens it, so both shapes load.

  New `db.defaultSchema` drops one schema's qualifier from the generated types:
  with `defaultSchema: 'app'`, `app.user` is queried as `selectFrom('user')` and
  typed as `User` rather than `AppUser`, matching what a project whose
  `search_path` already resolves the schema actually writes. Tables in other
  schemas stay qualified. Where dropping the qualifier would make two tables
  share a name, the table keeps its qualifier and the codegen warns (PKU485)
  rather than letting one silently shadow the other — queries against the loser
  would have typechecked against the wrong columns.

  The generated key is what Kysely puts in the SQL, so this is opt-in and
  separate from `db.schema`: setting it for a schema the connection does not
  resolve gives you queries that compile and then fail to find their table.

- 155528a: The PKU910 sessionless-output diagnostic advised marking a column `@public`, a
  SQL-comment annotation syntax that no longer exists. Column classification is
  sourced solely from the hand-authored `db/annotations.ts`, so the message now
  points there.
- 78b29f0: `SecretService` now returns a `SecretValue<T>` rather than the bare value, so a
  vault secret cannot reach a sink by accident.

  `SecretValue` is nominally typed, which means it is not assignable to `string`
  (or to any other concretely-typed field). Every sink with a real type — a
  database column, an email body, a session payload — rejects it with no lint
  rule involved. The sinks typed `any`, `unknown`, or a free generic — the logger,
  queue payloads, webhook and email inputs, and a function's own output — are
  guarded with `Safe<T>`, which collapses a `SecretValue` found anywhere inside
  `T`, however deeply nested, to `never`.

  Unwrap deliberately at the point the secret reaches the wire:

  ```ts
  const secret = await secrets.getSecret('BETTER_AUTH_SECRET')
  betterAuth({ secret: secret.reveal() })
  ```

  Two behaviours cover what types cannot see. Structured serialization redacts —
  `JSON.stringify` and node's inspect both yield `[secret]`, so an audit or log
  write stays honest without crashing the request. String coercion throws
  `SecretCoercionError`, because a template literal is always a leak.

  `AuditLog.write` is guarded the same way as the logger, since an audit event
  carries `input` and `metadata` as `unknown` and nominality alone cannot stop a
  secret landing in one.

  `.reveal()` is the deliberate escape hatch, and what it hands back is an
  ordinary string as far as every sink signature is concerned. **PKU953** closes
  that gap: under `pikku all --security` the inspector reports a revealed secret
  that flows into a logger, an audit, a queue, an email or a webhook — `console` included.

  This also fixed a real one: `remote-addon-auth.ts` called `String(token)` on an
  `unknown` and wrote the result straight into an `Authorization` header.

- Updated dependencies [62ea4cc]
- Updated dependencies [9dddff8]
- Updated dependencies [78b29f0]
  - @pikku/core@0.12.76

## 0.12.53

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

- d041d5b: Let a generated file declare scopes, roles and personas without taking the
  single-declaration slot.

  `defineScope`, `defineSystemRole` and `definePersonas` are one-per-codebase, and
  the CLI generates declarations of its own — `user-admin.gen.ts` ships the whole
  `admin` scope tree. Any project that scaffolded one therefore had two
  declarations and failed codegen with PKU583, and the losing file's scopes were
  dropped from the metadata rather than merged.

  The rule exists to name the one place a person reads from and adds to, and
  nobody adds to a file the next codegen run overwrites. A generated declaration
  is still extracted; it just neither claims the slot nor collides with the app's
  own.

- fd72e58: Make personas a first-class surface rather than a detail of the test runner.

  A persona is now read in three places — the knowledge base resolves `persona:`
  URIs against it, scenarios cast it as an actor, and a virtual user runs as it —
  so it gets its own page at `/personas` under a new **People** section in the
  rail, alongside Users. The card is a profile: avatar, name, job title, computed
  address, the system roles they hold, and how many scenarios cast them. Opening
  one expands each role to the scopes it confers, which is the half of the picture
  that explains a 403.

  `definePersonas` takes an optional `avatarUrl` — any URL a browser can load.
  Nothing is derived from the address: a persona's address is synthetic, so a
  derived identicon would be the same shrug for everyone. Omitted, the console
  keeps drawing the deterministic colour-and-icon avatar from the persona's id.

- fd72e58: Read the actors that are not people on the personas page.

  The platform — the app acting on itself, what `pikkuPlatformScenarioStep`
  declares — now has a row of its own, alongside one per addon whose system a
  step makes act. They sit behind a People / System / All filter that opens on
  the people: a subject holds no roles and signs in as nobody, so leading with it
  would put the rows nothing is authorized through above the ones that are.

  The platform row is built in rather than derived. A project that has never
  written a platform step still has a platform, and a card that appeared the
  moment somebody declared their first step would read as a feature they had
  switched on.

  Also: PKU680 now counts `expectService`, `expectError` and `expectEventually`
  as assertions. They are inline steps and carry no phase, so a scenario whose
  only witness was a recorded service call was being told it never asserts.

- 894b2f8: `defineScope` and `defineSystemRole` accumulate across call sites again. Only `definePersonas` is one-per-codebase.

  The previous release made all three single-declaration constructs, which no project scaffolding user-admin could satisfy: the CLI generates a `defineScope` of its own in `user-admin.gen.ts` carrying the whole `admin` tree, and `@pikku/addon-console` spells the same tree out again, so a second hand-written declaration failed the build with PKU583 — and the losing file's scopes were dropped from the metadata rather than merged.

  Exempting generated files would have reinstated exactly the ambiguity the rule removes, only for the files nobody can read the rule from. The real fix is for `admin` to be a default scope nobody declares, at which point the rule can come back for scopes and roles.

  `definePersonas` is unaffected: nothing generates one, so its single call site stands.

- dd19aa7: Drop `scopes` from sessionless functions, rename `selfAuthenticated`, and make both
  escape hatches opt-in.

  **`scopes` are gone from `pikkuSessionlessFunc`.** They are AND-ed and `verifyScopes`
  fails closed on a session that does not exist, so every scope listed on a sessionless
  function rejected the anonymous caller it exists to serve. `CorePikkuSessionlessFunctionConfig`
  now states this once in core, and the generated `pikkuSessionlessFunc` / `pikkuVoidFunc`
  configs derive from it — so the field is absent rather than subtracted.

  `@pikku/addon-console`'s `installAddon` and `installOpenapiAddon` are now `pikkuFunc`.
  Both set `auth: true` and `scopes: ['admin']`, and a test exercises that gate, so the
  scopes were load-bearing — they only compiled as sessionless because the config accepted
  a field it could not honour. No behaviour change: both already required a session.

  **`selfAuthenticated` is now `permissionsInBody`.** It never described authentication:
  what it records is that the permission check lives in the function body rather than in a
  declared `permissions` entry.

  **Both escape hatches must be opted into**, via a new `allow` block in
  `pikku.config.json`:

  ```json
  "allow": { "permissionsInBody": true, "complexWorkflows": true }
  ```

  Unset means unavailable, and using the feature is a build error naming the flag that
  would permit it — PKU576 for `permissionsInBody`, PKU643 for `pikkuWorkflowComplexFunc`.
  Both trade something the tooling can inspect for something only a reader can verify: a
  permission check buried in a body, or workflow steps that cannot be serialized into the
  graph, replayed, or migrated. Both are occasionally right, and both are the path of least
  resistance whenever the declarative form is merely inconvenient. Whoever owns the project
  makes that call once, in writing, instead of every author making it silently at the call
  site.

  **PKU574's message no longer contradicts any of this.** Every function it reports is
  sessionless — that is how the population is selected, not a finding — yet it opened by
  reporting that they "require neither a session", then advised adding scopes. It now names
  them as sessionless and recommends only gates an anonymous caller can meet:
  `permissions`, `auth: true`, `wireAddon({ auth: true })`, or dropping `expose: true`.
  `permissionsInBody` is deliberately absent from that list: a diagnostic should not
  advertise its own escape hatch.

- 50ec500: Make `defineScope`, `defineSystemRole` and `definePersonas` single-declaration constructs
  — exactly one call site per codebase, the rule `pikkuBetterAuth` has always had.

  Each of the three already takes a keyed object, so one call declares as many entries as
  you like. Spreading the calls across files bought nothing and cost the thing that matters:
  there was no answer to "where do I add a persona?", so downstream tooling and agents had
  nowhere unambiguous to read from or append to. The only duplicate handling that existed
  caught a narrow case — the same id declared twice with different content — and said
  nothing about the same id declared twice in two files.

  A second call now fails the build with `PKU583` (`defineScope`), `PKU584`
  (`defineSystemRole`) or `PKU585` (`definePersonas`), naming both source files and saying
  to declare them all in one call. A second call in the _same_ file is refused too: "the
  file" is not an answer either when the file holds two calls.

- Updated dependencies [32277d5]
- Updated dependencies [ea8aabf]
- Updated dependencies [33e96ab]
- Updated dependencies [fd72e58]
- Updated dependencies [fd72e58]
- Updated dependencies [fd72e58]
- Updated dependencies [894b2f8]
- Updated dependencies [dd19aa7]
- Updated dependencies [50ec500]
  - @pikku/core@0.12.75

## 0.12.52

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

- Updated dependencies [6a307f0]
- Updated dependencies [afef587]
- Updated dependencies [8075f6a]
  - @pikku/core@0.12.74

## 0.12.51

### Patch Changes

- c984df6: Give an agent's tools back the descriptions their authors wrote

  A tool's description is what the model is told the tool does, and the main
  thing it chooses between tools on. It was not reaching the model. `description`
  is classed as a verbose field, so it is stripped from the metadata bundled into
  the generated bootstrap — the copy `pikkuState('function', 'meta')` is built
  from. `buildToolDefs` read the description from there, found it always
  undefined, and fell through to the tool's own name. Every agent has been
  choosing between bare identifiers. The same fallback was offering an addon's
  MCP tools under their names, for the same reason.

  Tool definitions now resolve descriptions through `metaService`, which reads
  the verbose metadata and falls back to the minimal copy, so the authored text
  is recovered wherever the generated `.pikku` directory is readable. Where it is
  not — no `metaService`, or a deployment shipping only the stripped copy — a
  tool falls back to its name, which is what it did before. Addon metadata is
  likewise loaded verbose-first. `title` is no longer part of the chain: a title
  labels a tool in a UI, it does not tell a model when to reach for it.

  An addon has to ship the verbose file for any of this to reach it. `tsc` only
  emits the JSON it sees imported and nothing imports the verbose meta, so the
  bundled addons now copy it into `dist` explicitly.

  `ref()` is resolved at build time. It used to be pushed through codegen as an
  opaque string, so `ref('todos:doesNotExist')` generated cleanly and failed only
  when the agent ran. The inspector now resolves each reference against the
  project's functions, or — using the namespace-to-package mapping `wireAddon`
  already provides — against the addon's own metadata, and reports an unwired
  namespace (`PKU152`) or a missing function (`PKU153`) at codegen. An addon that
  has not been built yet contributed no metadata and is skipped rather than
  reported missing.

  New `pikku --strict-meta` additionally fails the build on any agent tool with
  no description (`PKU154`), including tools reached through an addon. It is off
  by default, so nothing that builds today stops building; turn it on to hold a
  project to the metadata its agents actually run on.

- 63ff32b: Run a CLI's commands on the server, over the connection the client opened

  A CLI that talks to a service has to ship the service's command tree, so the
  two versions drift: the binary someone installed months ago still believes in
  flags and commands the server has since changed. This makes the command tree
  the server's, and leaves the client holding only a socket.

  `wireCLI` gains `auth`, and a program wired with a channel entrypoint now
  generates a `__raw` route: the client forwards argv untouched, the server
  parses it, runs the command, and streams the output back as it happens. The
  terminating frame carries the exit code, so a failed remote command still exits
  non-zero locally. Renderers stay on the client and are matched by the command
  id the server reports; an unrecognised command falls back to JSON rather than
  failing.

  Every channel gains `channel.remote(...)`: calling a function on the peer at
  the other end of the connection and waiting for its answer. A channel is
  otherwise fire-and-forget in both directions, so this is what reaches a peer
  that has no address of its own — a CLI on a laptop, a browser tab, a sandbox
  behind NAT. It is on `channel` rather than `rpc` because it is bound to one
  connection: which peer answers is the socket the call goes out on, not
  something the RPC map could resolve. Any `wireChannel` gets it — a client
  registers what it is willing to answer to, and a name outside that list is
  refused.

  Requests are correlated by id, time out, and fail fast when the socket closes
  rather than waiting out the timeout. Replies are taken off the socket ahead of
  routing, so a channel needs no route for them and an answer can never be
  mistaken for a new message; the transport is created on first use and released
  when the channel closes, which is also what fails anything the departing peer
  still owed an answer to. Channels that only flow one way — SSE, an agent's
  output stream, a locally-run CLI — refuse the call outright instead of waiting
  for an answer that was never going to come.

  What a peer answers with is its word, so it is checked before a caller sees it
  — against the schema codegen already generated from the function's declared
  return type, the same one an agent tool or an HTTP response is checked against.
  A capability is declared with `pikkuRemoteChannelFunc`, which takes the usual
  `title` / `description` / `input` / `output` but no `func` — this side owns the
  contract, the peer owns the body. It registers under its name like any other
  function, so `channel.remote` is typed off the same generated map as
  `rpc.remote` and no caller has to cast, and a local call throws rather than
  missing: reaching it locally means a command asked the server for something
  only a client knows. A client on an older build fails the call it answered
  rather than the caller failing later somewhere with no reason to expect a bad
  shape; a name with no declared contract is left alone. Both frame guards
  validate the whole envelope rather than the action tag alone, and a failure
  payload with a non-string name or message falls back rather than being attached
  to an `Error`.

  The arguments going the other way are checked too, against the schema for the
  capability's declared input, before anything is registered or sent. That is not
  a boundary — the peer runs the code and has to check what it was handed, and a
  caller that meant harm would send arguments that pass. It catches drift, where a
  server built against a newer capability signature calls a client that predates
  it, and fails it here rather than inside someone else's process.

  A channel-driven CLI command uses this to ask its caller for machine-local
  facts mid-run — a git sha, a working tree, a local file. The CLI wire's own
  channel is synthetic (it exists so a command can stream progress without
  knowing where that goes), so it delegates `remote` to the connection the
  command actually arrived on.

  Because that runs code on someone's machine at a remote caller's request, the
  capability map says what _can_ run and approval says whether a particular call
  _should_. A capability may be declared `{ execute, needsApproval }`, sharing
  `ApprovalPolicy` — `needsApproval` and `approvalDescriptionFn` — with
  `AIAgentToolDef`, which has carried both since before channels could call back:
  both are an allowlist of named callables invoked by something other than the
  code that wrote them. The runtime around them is deliberately not shared, since
  an agent suspends its run and resumes it later while a reverse call is a live
  await with a person at the other end.

  A capability written as a bare function is unclassified, and unclassified means
  approval is required — the annotation nobody got round to writing is the one
  most likely to matter, so it fails closed. Declare
  `{ execute, needsApproval: false }` for a capability that may run unattended.
  Nothing infers this: core cannot tell a read-only capability from a destructive
  one, so `needsApproval: false` is the author asserting it, and the assertion is
  the only thing standing between a remote caller and the machine.

  The default is the opposite of `AIAgentToolDef`'s, where absence means "do not
  ask" — a tool is written by the same people who run the server it executes on,
  and a capability is not.

  `executeRawCLIViaChannel` reads `--auto-approve` and
  `--dangerously-auto-approve` out of argv (or `PIKKU_AUTO_APPROVE` /
  `PIKKU_DANGEROUSLY_AUTO_APPROVE`) and strips them before argv reaches the
  server — what may run on this machine is this machine's decision, and a flag
  the server can see is one the server could act on. `--auto-approve` permits the
  classified-safe set and refuses the rest; `--dangerously-auto-approve` permits
  everything and says so once on stderr. Interactively the user is asked per
  call, with `y` / `n` / `a`, where `a` is remembered for that one capability for
  the rest of the run and never written to disk — widening it to the session
  would quietly turn an interactive run into `--dangerously-auto-approve`. A run
  with no terminal and no flag refuses rather than assuming yes, because CI is
  exactly where an unattended `git push` would otherwise happen. The tiers are
  meaningful here in a way they would not be for an agent: the caller is a
  deterministic program whose source can be read, so "these calls are always
  fine" is a claim someone can actually justify.

  A peer that is asking a human sends a pending frame first, which stops the
  caller's timeout. Without it any approval slower than the timeout would fail
  the call and then discard the decision when it finally arrived. The call is
  still failed the moment the socket drops — what actually happens when a peer
  dies mid-prompt — and a peer that sends the frame dishonestly can do nothing
  but keep its own call waiting. A refusal is sent as an answer, so a denied call
  fails its command immediately rather than hanging.

  Fixes found on the way, each of which broke this path:
  - A websocket upgrade wrote middleware headers (CORS, on every request)
    straight onto the socket, so the first bytes a client saw were headers rather
    than `ws`'s `101` status line and the handshake failed to parse. Header
    writes are now buffered and flushed behind a status line only when the
    upgrade is actually being rejected.
  - An upgrade socket had no error listener while the channel opened, so a client
    that gave up mid-handshake took the whole server process down with an
    unhandled `ECONNRESET`.
  - `onConnect` and `onDisconnect` never saw the session established during the
    upgrade, so a channel could not tell who had just connected.
  - Setting the routing key on a channel result mutated the value in place, which
    throws for a primitive under ESM strict mode.

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

- f7567ad: Add `defineSystemRole()`: roles that ship with the product, declared in code.

  A system role is to a console-composed role what an AWS managed policy is to a
  customer-managed one — the console may show and grant it, but not rename,
  re-scope or delete it. The CLI extracts declarations by AST and generates a
  `SystemRoleName` union, so naming a role that does not exist fails the build,
  and a role granting a scope no `defineScope` declares fails it too.

  Removal is additive on the same terms as `defineScope`: deleting a declaration
  leaves an inert row rather than revoking everyone's grant mid-deploy.

  `ScopeService` gains `syncSystemRoles`, `findStaleSystemRoles` and
  `pruneSystemRoles`; `Role` gains `system` and `declared`. Implementations
  enforce immutability through the shared `assertRoleIsMutable` /
  `assertRoleNameAvailable` guards rather than each inventing the rule.

- 457cb25: Let a persona do a real job in production, and say where it may act.

  A persona was only ever a test subject: something you pointed at a stage to find
  out what the product does wrong. But the same declaration — a name, a job, the
  roles it holds and what it is trying to get done — describes a teammate doing
  the work for real, and nothing about the engine cared which one it was.

  Four changes make that difference explicit and enforced.

  **`environments` moves to the top level of `pikku.config.json`**, out from under
  `scenarios`. It was never a scenario's anything: `persona run` targets one, and
  now so does `persona sync`. An environment may be flagged `production: true` —
  a flag rather than a reserved name, because projects call it `prod`, `live` or
  `eu-prod`, and more than one environment can be production.

  **A persona may name its `environments`.** Omitting them means every configured
  environment _except_ the production ones, so nothing reaches production by being
  forgotten. Naming a production environment requires `disposition: 'accountable'`.
  The rule is checked twice, on purpose: the inspector refuses to generate a
  declaration that breaks it, and sign-in re-checks against the environment
  actually resolved — the build check trusts the file, and the run check does not
  trust which artifact got deployed. An unresolved environment fails closed.

  **`disposition: 'accountable'`** is that production disposition. It sits opposite
  `adversarial` on the intent axis rather than the care axis: what it changes stays
  changed, every call is recorded against its name, and it stops to ask rather than
  acting and reporting afterwards. Alongside it, **agents now appear in a persona's
  computed catalogue**, gated by the same scopes as the RPCs — an agent is reached
  rather than declared, so a persona finds the specialists its roles unlock and
  chooses between calling the API itself and handing the work over. That also fixes
  a latent gap: `talkTo` was wired at the target but never advertised in the
  instructions, so it was never used.

  **`pikku persona sync <environment>`** provisions them: it creates each account
  and applies the roles it declares, additively, and never revokes. Seeding is test
  data and `db seed` does not run in production; a teammate doing a real job still
  needs an account and its grants. It needs both halves of an environment — its API
  to sign the person in, its database to write the grants — and `--dry-run` reports
  who would be provisioned, with what, and why anyone was skipped.

  In the console, a virtual user now says where it may act — the environments it
  named, or the rule when it named none — and its dossier carries the `sync`
  command alongside the `run` one, because the account is not a by-product of a
  run. `accountable` reads as a disposition like the rest.

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

- 0e0f6eb: Add virtual users: LLM-driven synthetic users that work a real stage in
  character.

  A scenario proves a path somebody thought of. A virtual user works the same
  ground without the script — it signs in as a declared persona over the app's own
  auth, is handed the scenarios' BDD prose and the schema of every endpoint it may
  reach, and decides for itself what to do. It asserts nothing; a run produces
  findings, and their absence only ever means "not this time, not with this seed".

  There is nothing extra to declare. A persona with a `disposition` is a virtual
  user, and running it is what makes it one — see the `definePersonas` changeset
  for the declaration itself. Listing, describing or running one never loads the
  app: the inspector reads the literal declaration, the CLI writes
  `scopes/pikku-personas-meta.gen.json`, and `MetaService.getPersonasMeta()`
  serves it.

  **Dispositions are engine dials, not prose.** Each carries its own intent weights
  (continue / suspend / resume / abandon), temperature, re-read and repeat rates,
  and switches: `careless` puts things down and picks them up in the wrong order,
  `newcomer` starts with no memory, `auditor` is never offered a mutation,
  `adversarial` is shown the catalogue its roles do not cover — being offered a
  call it should not be able to make is the test — while those roles stay live as
  the oracle, so a success outside them is authorization drift rather than a pass.

  **Nothing is retrieved against.** The whole reachable catalogue goes into the
  instructions (~8k tokens on a 430-RPC project, cached for the run), because a
  ranking function would make the user only as adventurous as the ranking and lose
  exactly the endpoints worth stumbling into. Schema first: an endpoint must be
  described before it may be called.

  **No money in core.** The engine counts steps, calls, mutations and tokens; what
  they cost is the app's to decide through `stop(tally)`.

  CLI: `pikku persona list` and `pikku persona run <environment> [name]`, with
  flags overriding a declaration for reproduction (`--seed`, `--steps`,
  `--disposition`). Spending is a run flag too — `--steps`, `--mutations` and
  `--duration` bound a run, because how much you will spend today is not a fact
  about a person. Console: a Virtual Users screen beside Scenarios, built out of
  core's own derivation functions so it shows a run's actual inputs rather than a
  second implementation of them.

  `dev-ai-runner` now ships its own `@pikku/ai-vercel` and
  `@ai-sdk/openai-compatible` instead of requiring them from the project. Behind a
  proxy one openai-compatible provider answers for every prefix, so there was never
  a per-vendor package worth making somebody install; the project's copies still
  win when it has them, and both load from the same place or neither does.

- Updated dependencies [c984df6]
- Updated dependencies [63ff32b]
- Updated dependencies [ba6cc08]
- Updated dependencies [d007191]
- Updated dependencies [a7b26c5]
- Updated dependencies [457cb25]
- Updated dependencies [f7567ad]
- Updated dependencies [ba6cc08]
- Updated dependencies [a2e21e5]
- Updated dependencies [457cb25]
- Updated dependencies [86a50b9]
- Updated dependencies [0e0f6eb]
  - @pikku/core@0.12.73

## 0.12.50

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

- b89d3b3: Invalidate the TS-schema cache when a type it was built from changes

  The on-disk schema cache was keyed on the synthesized custom-types source, the
  generator options and the inspector version — but not on the types it actually
  resolves. A named type (anything a function declares as its input or output)
  appears in that source only as a name; its definition is read out of a project
  file or a dependency's `.d.ts`. Change the shape without changing the name and
  the key is identical, so pikku serves a schema for a type that no longer looks
  like that, and requests are validated against it.

  The stale schema also outlives `rm -rf .pikku`, because the cache lives in
  `node_modules/.cache/pikku/ts-schemas.json`.

  Codegen now records the files each schema set was derived from, storing their
  mtime and size beside it, and regenerates when any of them moves or disappears.
  The schema program is rooted at the virtual types file, so its source files are
  exactly the transitive closure the schemas depend on. A cache written by an
  earlier version carries no dep list and is treated as stale. The check costs
  about 3ms per cache hit, and also guards the in-process cache, so `pikku dev`
  picks up a type edit without a restart.

- Updated dependencies [384e484]
- Updated dependencies [b5a73fb]
- Updated dependencies [6be5ab0]
  - @pikku/core@0.12.72

## 0.12.49

### Patch Changes

- 426610a: Scenario instrumentation is no longer scaffolded into projects, and no longer deploys.

  `scaffold.scenarios` generated four functions — `pikkuScenarioTakeLiveCoverage`, `pikkuScenarioResetLiveCoverage`, `pikkuScenarioResetStubs`, `pikkuScenarioGetStubCalls` — into the project's own source. As project source they were indistinguishable from application code: registered in the app bootstrap, listed in the app's function and RPC meta, and shipped `expose: true` inside every deployed bundle. Coverage and stub inspection are things you do to a development server; production carried two endpoints that fingerprint the build and one that resets a global tracker, gated only by whether a metadata file happened to sit beside the bundle.

  `pikku dev` now registers the implementations itself, after the app bootstrap. Nothing is generated, nothing is written to the project, and a bundle cannot carry what was never in its bootstrap — `pikku serve` and every deployed unit have no trace of them. The scenario runner reaches them over `/rpc/<name>` exactly as before.

  Also:
  - The inspector ignores these four names wherever it finds them, so a project that has not regenerated — and still has the scaffolded file checked in — stops deploying it immediately. Codegen deletes the retired scaffold on its next run.
  - They no longer count towards a project's function total, so `pikku scenario --coverage` stops reporting four permanently-uncovered functions that were never the project's to cover.
  - The instrumentation no longer carries schemas (there was nothing to validate but one optional string), which drops the `zod` dependency the scaffold silently required of every project that enabled it.
  - They are registered sessionless, so `scaffold.scenarios: true` — as opposed to `'auth'` — now genuinely means "no session required". As a sessioned `pikkuFunc` with `auth: false`, it demanded a session anyway and logged a warning saying so.

- 09973b9: Scenarios, features and steps no longer reach a deployment.

  Steps were already held back from the app bootstrap, so a deployed server never imported a step body. Everything _about_ a scenario still travelled with the application: a `pikkuScenario(...)` is a function, so its name, schemas and hashes sat in the app function meta; the schemas it and its steps validate against sat in the app's `register.gen.ts` — on one project 458 of the 582 registered schemas belonged to tests; its name sat in the internal RPC meta; and because a scenario is _also_ a workflow, the inspector synthesised a `wf-orchestrator-<scenario>` queue worker for each one. The deploy analyzer, which reads inspector state rather than the partitioned codegen output, then read all of it back as application code: a unit per scenario, a `WorkflowDefinition` per scenario, and a real queue per scenario. A 13-scenario suite turned into 13 production queues named after tests, waiting for a provider to create them.

  The existing scenario/app partition is now applied everywhere it was missing. `FunctionRuntimeMeta` gains a `scenario` marker (the counterpart of `scenarioStep`) so a scenario body is recognisable without walking the workflow graph; scenario bodies join their steps on the scenario side of the function-meta and registration split; schemas only a scenario or step needs are written and registered under `.pikku/scenarios/schemas/` and imported by the scenario bootstrap alone; scenario names are dropped from the internal RPC meta; no orchestrator queue worker is synthesised for a scenario; and the deploy analyzer drops both scenario functions and scenario workflows before it decides what a deployment contains.

  The MCP metas are keyed by wiring rather than by function, so a scenario wired as an MCP tool, resource or prompt was the one id that still reached the manifest after the function and workflow filters — as an endpoint on the gateway plus a gateway dependency on a unit that was never emitted. Those ids are now filtered too.

  `scenarioSchemaDirectory` is rejected when it resolves to the same directory as `schemaDirectory`. A schema write owns its directory — it emits `register.gen.ts` and prunes every schema file its own required-set does not name — so sharing one would replace the application register with the scenario-only one and delete the app's schema files, which nothing downstream can detect.

  Nothing changes for `pikku scenario run` — the scenario bootstrap still registers every scenario, feature, step, meta and schema. What changes is that a bundle stops carrying them.

- Updated dependencies [8a2c993]
- Updated dependencies [a261006]
- Updated dependencies [09973b9]
  - @pikku/core@0.12.71

## 0.12.48

### Patch Changes

- 04b8607: Make the unmodellable-for-of diagnostic tell you what is actually wrong. It always blamed the iterable ("its iterable must be a data array"), which was false whenever the real cause was a `workflow.do` nested inside an `if`/`switch` — a DSL fanout body is a flat list of steps with no branch member, so the diagnostic now says so and points at `.filter` or `pikkuWorkflowComplexFunc`. Also stops the same diagnostic firing on a `for-of` that contains no workflow call at all: a loop that only massages locals has no step to lose, so erroring on it was a false positive.
- 7c8f015: Hard-error on a for-of a DSL workflow can't model, instead of silently dropping it.

  A `pikkuWorkflowFunc` (DSL) whose body contained a computed/counting loop — e.g. `for (const i of [...Array(n).keys()])` — used to serialize with **zero steps**: the DSL extractor only models a for-of as a sequential fanout over a data-array identifier/field (`data.items`), so a non-path iterable made `extractSequentialFanout` return null and the extractor dropped the loop _and every `workflow.do` inside it_. The invoked functions then never entered `invokedFunctions`, so they got no `addFunction()` registration and threw `Function not found` at runtime — a silent codegen footgun that bricked every prod sandbox create.

  Now the extractor pushes a validation error naming the offending for-of, so `pikkuWorkflowFunc` reports `INVALID_DSL_WORKFLOW` at codegen. A genuine control-flow/counting loop belongs in `pikkuWorkflowComplexFunc`, which falls back to the basic AST walk that _does_ register loop-invoked functions.

- 5962e51: Give the inspector's program the project's tsconfig path mappings.

  The inspector builds its own TypeScript program rather than reusing the project's, which is what keeps a cold run affordable — but it hand-rolled its compiler options and so had no `paths`. An import the project resolves only through a `paths` entry therefore did not resolve inside the inspector, and the factory the inspected function was passed to came back as `any`. A function whose input type comes from that factory's contextual type — rather than an explicit generic or a named `input:` schema — then recorded no input at all, silently, with no diagnostic.

  `inspect` takes a new `tsconfig` option (the CLI passes `config.tsconfig`, including on a setup-only run, where `schemaConfig` is absent). Only resolution keys are copied across — `baseUrl`, `paths`, `rootDirs`, `pathsBasePath`. Type-inference options such as `strict` deliberately stay the inspector's own, because changing those would change the types it records.

  This was latent rather than live: the generic path reads type _nodes_, the schema path reads an identifier, output types come from the handler body, and JSON schemas are generated by a separate tsconfig-aware program — so nothing in the tree reached the contextual-type fallback. Regenerating the e2e project and the `functions` template produces byte-identical output.

- 5962e51: Add `pikkuFeature`, a grouping primitive for scenarios.

  A feature groups scenarios the way gherkin's `Feature:` groups `Scenario:`, and gets `Examples:` for free as an ordinary loop:

  ```ts
  export const credentialFeature = pikkuFeature({
    name: 'Credential API',
    tags: ['credential'],
    before: startsMockOAuthServer,
    after: stopsMockOAuthServer,
    scenarios: [
      credentialLazyLoadScenario,
      ...['stripe', 'google', 'hmac-key'].map((name) => ({
        scenario: credentialRoundTripScenario,
        data: { name },
      })),
    ],
  })
  ```

  - Scenarios are referenced by **imported identifier**, not by string name, so a renamed or deleted scenario is a compile error rather than a silent skip. A `{ scenario, data }` entry's `data` is typed against that scenario's own input.
  - Feature hooks run **once around the whole group** (`before → a → b → c → after`), not per scenario, and `after` runs in a `finally`. Per-scenario setup stays the scenario's own `before`; gherkin's `Background:` is deliberately not expressible.
  - A scenario's effective tags are its own plus its feature's, so `--tags credential` selects through the feature.
  - New `--features` selector on `pikku scenario run`, and `pikku scenario list` now prints features with their scenarios indented. Every filter narrows the same plan, so narrowing a feature to two of its five scenarios still runs its hooks exactly once around those two.
  - The **feature is the run unit**: `--flows` on a scenario whose every feature entry carries `data` errors and names the features containing it, because the feature is what supplies that data. A scenario referenced bare anywhere, or in no feature at all, still runs standalone.

  `pikkuFeature` infers its scenario list with a `const` generic, so `CoreFeature['scenarios']` is `readonly` — otherwise the emitted `addFeature(id, feature)` call does not typecheck.

  Membership is resolved at runtime by object identity — `pikkuScenario` returns its config verbatim, so a feature holds the very object that was registered. That is what lets the scenario list be built by a loop, which no static analysis could enumerate. It also means a scenario constructed inline inside a feature is never registered, and is reported as unresolved rather than silently running as something else.

- 5962e51: Add `before` / `after` hooks to `pikkuScenario`, and make an unextractable scenario a hard error.

  A scenario config now takes `before` and `after`. Both have the same signature as `func` — `(services, data, wire)` — with the return value discarded, so there is no new type to learn and a hook reaches the app the same way the body does, through `wire.actors`:

  ```ts
  export const credentialScenario = pikkuScenario({
    title: 'A credential is loaded on first use',
    tags: ['scenario', 'credential'],
    before: resetsCredentials,
    after: removesInstalledAddon,
    func: async (services, data, { scenario, actors }) => { ... },
  })
  ```

  - `before` throwing skips the body and fails the run, but `after` still runs.
  - `after` always runs, in a `finally`. Throwing fails a run that would otherwise have passed; on an already-failed run it attaches as the `cause` and never replaces the original error.
  - Neither runs when the run is suspended or waiting — teardown only fires at a terminal outcome.
  - Hooks are not ladder rows: the runner records nothing for them, and a failure is labelled by phase via the new `ScenarioHookError`.
  - Hooks are scenario-only. A `before`/`after` on a `pikkuWorkflowFunc` never runs — a workflow is durable and resumable, so a callback that reran on every replay would have no honest meaning.

  Two fixes that scenarios needed to be safe to write:
  - A closure in a complex-workflow or scenario body is no longer held to the DSL statement whitelist. A single `try`/`catch` inside any callback previously failed extraction, and the fallback path understands `do`/`sleep` but not `step`/`given`/`when`/`then` — so the scenario registered with **zero steps** and passed vacuously, with no diagnostic. Plain DSL workflows still descend into callbacks, which is what validates fanout bodies.
  - New `PKU679`: a scenario that fails DSL extraction is now a critical error and refuses to register, instead of silently registering empty. A scenario that declares no input parameter at all is legitimate and still extracts.

- a436645: Redesign the console's scenarios screen as living documentation of a project's BDD features.

  The inspector now statically extracts `pikkuFeature` declarations — name, description, tags, the scenarios each one groups (including `{ scenario, data }` examples), and whether it declares `before`/`after` — and the CLI writes them to `<outDir>/scenarios/features.gen.json`, which `MetaService.getFeaturesMeta()` reads and the console addon returns from `getAllMeta`.

  The scenarios page reads that back as a document: features on the left, and on the right the selected feature's scenarios, each rendered as the given/when/then ladder of prose its author actually wrote, with repeats shown as `for each x in xs`, `Examples:` tables for parameterised entries, skip reasons stated rather than hidden, and each scenario's cast of personas inline. The Flows/Personas segmented control is gone; tags filter the document the same way `pikku scenario run --tags` filters a run.

- 47478a4: Let a scenario declare why it is held out of a default run.

  `pikkuScenario({ skip: 'why' })` keeps the scenario in the plan and reports it as `SKIP <name> (<reason>)` on the ladder, instead of the alternatives available until now: deleting it, commenting it out, or leaving it red. Naming it directly with `--flows` clears the quarantine and runs it; selecting the feature it belongs to does not, because a feature is a group and running the group should not silently drag a quarantined member in.

  The run report's `skipped` list now carries a reason per scenario rather than assuming `--no-browser`, so a browser scenario held back on a machine with no browser reads differently from one the project quarantined itself.

  `@pikku/console` gains a test id on the addon detail page's Setup tab, which was previously only reachable through its translated label.

- 2434f1b: Fix two silent losses in scenario step extraction.

  Destructuring a scenario step result (`const { threadId } = await scenario.given(...)`) dropped the
  step from the graph without a diagnostic — the step stayed fully typed and present in the step map,
  then failed at runtime with `Function not found`. It now reports PKU679, like every other step form
  the DSL cannot model.

  A constant referenced as step input (`{ resourceId: RESOURCE_ID }`) was serialized as
  `{ $ref: 'trigger', path: 'RESOURCE_ID' }` — a read of a trigger field that does not exist. A `const`
  with a literal initializer is now inlined as that literal.

- 5962e51: Add `template` to `pikkuScenarioStep`, so a step's reported prose names the values it was called with.

  `description` documents what a step does, for the console and for whoever reads the source. `template` is what a reader of the report sees, with `{placeholders}` filled from the input the step was actually called with:

  ```ts
  export const seesAddonCard = pikkuScenarioStep<
    { packageName: string; state?: 'installed' | 'available' },
    { visible: true },
    true
  >({
    name: 'seesAddonCard',
    description: 'sees an addon in the gallery',
    template: 'sees {state} addon {packageName}',
    browser: true,
    func: async (_services, { packageName, state }, { browser }) => { … },
  })
  ```

  ```
  Then  the admin sees at least 10 addons on offer          ✓  3ms
  When  the admin searches for stripe                       ✓  10ms
  Then  the admin sees available addon @pikku/addon-stripe  ✓  77ms
  ```

  Previously the only way to get that was a `description` at every call site, which meant writing the sentence once per call rather than once per step — and a call site that forgot it reported the same sentence three times in a row.
  - A placeholder with no recorded value renders as nothing and the surrounding whitespace collapses, so an omitted optional input reads as a shorter sentence rather than leaking a literal `{state}` into the report. Type placeholder values so they read as words (`state?: 'installed' | 'available'`, not `installed?: boolean`).
  - A call-site `description` still wins, the same way it already won over the step's `description`.
  - `renderStepTemplate` is exported from `@pikku/core/workflow` alongside `composeStepProse`, so the CLI reporter and the console render identically.

  Scenario steps now record their input on the run (`inlineStep` persisted `null` for every inline step, so there was nothing for a reporter to interpolate). This is what `getRunSteps` already exposes as `data` for RPC steps.

  A step called from a loop gets its template too. Its durable name is built at runtime (`sees @pikku/addon-todos`) from a declaration the static meta records verbatim (`sees ${packageName}`), so the two can never match by name — it used to fall back to the bare name, with no keyword, actor or template:

  ```
          sees @pikku/addon-console                              ✓  85ms
  Then    the admin sees installed addon @pikku/addon-console    ✓  92ms
  ```

  The join is by **step function**. A scenario step is dispatched by name exactly as an RPC is, so it now records that name in the run's existing `rpcName` slot — no new field, no schema change in any workflow store. Nothing dispatches off that value anywhere; step identity always comes from the code being replayed.

  To keep the slot honest, a scenario step is now its own **kind of RPC**, alongside public / private / remote: `FunctionMeta.scenarioStep` marks it, and `rpcExposed` refuses it even if something marks it `expose: true`. Steps were already left out of the RPC registry; this makes "never network-callable" a property the runtime enforces rather than one the registration path happens to produce.

  `collectScenarioStepProse` now returns `{ byStepName, byStepFunc }` rather than a bare `Map`, and `buildStepLadder` takes that. The step name still wins; the function index only decides steps recorded under a name no declaration carries, and a function called from several sites that disagree on their prose is left out rather than guessed at.

- 5962e51: Add `pikkuScenarioStep` — named, typed scenario steps whose body is an ordinary pikku function.

  A scenario step is referenced by typed string name, the same way `workflow.do` references an RPC, and is checked against a generated `FlattenedScenarioStepMap`:

  ```ts
  export const buysAnApple = pikkuScenarioStep({
    name: 'buysAnApple',
    description: 'buys an apple',
    func: async (services, data: { qty: number }) => { ... },
  })

  await scenario.given('buys an apple', 'buysAnApple', { qty: 1 }, { actor: actors.shopper })
  // renders: Given the shopper buys an apple
  ```

  - `given`/`when`/`then` are sugar over `step`, setting only the prose prefix. The runner renders a step ladder from the recorded run.
  - Steps default to `retries: 0` — a failed assertion is not retried.
  - Steps are deliberately **not** registered as RPCs, so a browser-driving step is never network-callable.
  - `browser: true` steps receive a browser handle on the wire. `@pikku/playwright` is a new package providing the Playwright-backed provider, signing each actor's browser context in through the same actor path the HTTP actors use. Without a provider, `pikku scenario run --no-browser` **skips** browser scenarios instead of failing them.
  - New diagnostics: PKU677 (a `browser: true` step called without an actor) and PKU678 (a step target that is not a static string literal).
  - Fixes `--no-<flag>` boolean negation in the CLI command parser, which previously parsed as an unknown option.
  - Fixes PKU673 (a scenario func destructuring services), which never fired because it ran before function meta existed; it now runs in post-processing.
  - Fixes scenario/workflow steps nested in `for...of` and `Promise.all` being dropped from workflow meta.

- Updated dependencies [539ee0b]
- Updated dependencies [a1a6816]
- Updated dependencies [dc3e11e]
- Updated dependencies [24da616]
- Updated dependencies [04bfe3f]
- Updated dependencies [5962e51]
- Updated dependencies [5962e51]
- Updated dependencies [cd6453c]
- Updated dependencies [a436645]
- Updated dependencies [46cf63e]
- Updated dependencies [9e666bc]
- Updated dependencies [1c841d8]
- Updated dependencies [47478a4]
- Updated dependencies [9e666bc]
- Updated dependencies [5962e51]
- Updated dependencies [5962e51]
- Updated dependencies [61b9bf8]
  - @pikku/core@0.12.70

## 0.12.47

### Patch Changes

- 91077ff: The auth factory's services are read from the auth definition, not from the handler generated out of it.

  `pikkuBetterAuth((services) => ...)`'s destructured services are what `authorize` and the session callbacks actually use, and they reach the generated services map by being stamped onto the auth handler's function meta. On the first run in a clean checkout that handler's file has not been written yet — so there is nothing to stamp, nothing to aggregate, and the map comes out marking those services unused. Run it a second time, with the file now on disk, and it says the opposite.

  The consequence is not cosmetic: `RequiredSingletonServices` is built from that map, so a clean build types the services as optional and tree-shakes them out of the deployed auth worker — the exact failure the stamping exists to prevent, reintroduced by the one case where it cannot run. A CI checkout is always the first run.

  The definition is inspected from hand-written source on every pass, so its services are now folded into the required set directly. A clean build and an incremental one give the same answer.

## 0.12.46

### Patch Changes

- a8f9a7d: Distinguish an unresolvable schema type from an unsupported schema library.

  Both failures shared one message, so a plain `z.object({...})` whose type TypeScript
  could not resolve — a file outside tsconfig `include`, or a generated file such as
  `.pikku/db/zod.gen.ts` that had not been written yet — was reported as
  "Ensure your schema is imported from a supported validation library". The schema is
  dropped either way (`inputSchemaName: null`, no generated schema file), so the message
  is the only signal that a function has silently lost its input contract, and that
  advice is unactionable when the schema already is zod.

- eaabcbf: fix(inspector): don't reject plain destructuring in DSL workflows

  `extractDestructuredDeclaration` reported "Destructuring a step result is not
  supported in DSL workflows" for EVERY destructuring statement whose initializer
  wasn't `await Promise.all([...])` — including ordinary local bindings that
  involve no step at all, such as `const { runId } = input`.

  Destructuring the workflow's own input is the single most idiomatic line in a
  DSL workflow, so this rejected working workflows wholesale under a message
  about step results that named nothing the author had written.

  The diagnostic now fires only when the destructured initializer really is a
  step (`await workflow.do(...)`, a parallel group, or a parallel fanout).
  Anything else passes through as a non-step, exactly as the identifier path
  already does for `const x = someLocal`.

- Updated dependencies [f11675f]
  - @pikku/core@0.12.68

## 0.12.45

### Patch Changes

- ae4f59a: Gate admin capabilities on scopes, and scaffold user management

  Admin capabilities were gated on `user.role === 'admin'` — a single text column
  meaning "can do everything". Impersonating a user, rebinding a shared
  credential and reading the user directory are distinct capabilities that one
  user can hold independently, so they are now scopes on an `admin` tree:

  | Gate                                   | Scope                    |
  | -------------------------------------- | ------------------------ |
  | impersonation                          | `admin:impersonate`      |
  | `credentialOAuth`'s `canLinkSingleton` | `admin:credentials:link` |
  | reading the user directory             | `admin:users:list`       |
  | creating a user out of band            | `admin:users:create`     |
  | ban / unban                            | `admin:users:ban`        |
  | delete a user                          | `admin:users:remove`     |
  | revoke a user's sessions               | `admin:users:sessions`   |
  | set a user's password                  | `admin:users:password`   |

  Holding the bare `admin` scope satisfies all of them via pikku's existing
  parent-grant rule, so it is a one-for-one replacement for the old role.

  better-auth's `admin()` plugin is still what implements ban, delete,
  session-revocation and set-password, so it stays. Its `user.role` column is no
  longer something pikku grants: it is _projected_ from the scope store when a
  session is built, and only from the scopes whose capability better-auth's own
  endpoints gate on the caller's role. Someone granted `admin:users:list` can read
  the directory — which goes straight to the auth adapter — without gaining the
  power to ban, and revoking a scope demotes the role on the next sign-in. Scopes
  remain the single source of truth.

  New `scaffold.userAdmin` in `pikku.config.json` generates the whole set —
  `pikkuAdminListUsers`, `pikkuAdminCreateUser`, `pikkuAdminSetUserBanned`,
  `pikkuAdminRemoveUser`, `pikkuAdminRevokeUserSessions` and
  `pikkuAdminSetUserPassword` — into your project. Listing or banning a user is
  ordinary application behaviour and must not require installing the console.
  Codegen fails with an actionable error if better-auth is wired without
  `admin()`. The console's Users page calls these same functions, showing each
  action only where the caller holds its scope.

  Every scaffold now emits a directory named for its domain — `scaffold/admin/`,
  `scaffold/rpc/`, `scaffold/agent/`, `scaffold/auth/`, `scaffold/console/`,
  `scaffold/graph/`, `scaffold/realtime/`, `scaffold/scenarios/`,
  `scaffold/webhook/`, `scaffold/workflow/` — holding its wiring file beside a
  `*.schemas.gen.ts` sibling, and every generated payload is a zod schema instead
  of a TypeScript generic. The schemas have to stand alone: the inspector reads a
  zod schema by importing the module that declares it, which it cannot do for a
  wiring file whose relative pikku-types import per-unit deploy codegen rewrites.

  Resolving a schema by reference rather than by name also fixes the agent HTTP
  surface. `agentCaller` and `agentStreamCaller` take the same payload but had to
  repeat the type literal verbatim in each generic position, because the extractor
  synthesised the schema name from the _function_ name and so recorded an
  `inputSchemaName` with no schema behind it whenever the two shared a named
  alias — every agent call through that alias failed with `MissingSchemaError`.
  One `AgentCall` schema now backs both.

  Where a payload's shape belongs to `@pikku/core` (`WorkflowRunStatus`,
  `FunctionCoverageReport`, `StubCall[]`) the generated function carries no
  `output` schema and the inspector infers it from the handler's return type;
  re-declaring a core type in zod would be a second definition free to drift.

  Upgrading rewrites the layout in place: codegen prunes the pre-directory copy of
  each scaffold file before it inspects the source tree, since the old flat file
  still wires the same routes and leaving it behind would wire everything twice.

  `@pikku/core` gains `hasScopes(required, held)`, the non-throwing counterpart to
  `verifyScopes`, and declares `auth` on `CoreSingletonServices` — the auth
  instance the generated `pikkuServices` wrapper already injected but never typed.
  A scope root declared twice (an addon and its host both contributing the same
  `admin` tree) now flattens to one entry per id instead of emitting it twice.

  BREAKING: there is no role fallback for the scope-gated capabilities. An app
  that relied on the old default must register a `ScopeService` and grant `admin`
  (or a narrower `admin:*` scope). Every gate fails closed and warns when no
  `ScopeService` is registered. `delegatedAuth`'s `defaultRole`/`mapRole` now
  grant a pikku role through the `ScopeService` instead of writing better-auth's
  `role` column, and the `credentialOAuth` platform user no longer sets `banned`.

  BREAKING: the console reads its user directory over the scaffolded
  `pikkuAdminListUsers` RPC (gated on `admin:users:list`, backed by better-auth's
  `$context.adapter`) instead of `client.admin.listUsers`, and
  `UsersTableUser`/`UsersTableLabels` no longer carry `role` — there is no role
  column to render. `@pikku/addon-console` no longer ships a `console:listUsers`
  function: user management is not the console's job, so a host that wants the
  Users page must enable `scaffold.userAdmin`.

- Updated dependencies [ae4f59a]
  - @pikku/core@0.12.67

## 0.12.44

### Patch Changes

- 1a86d3f: Stop silently dropping DSL workflow constructs during extraction.

  Four constructs produced a wrong workflow graph with no diagnostic:
  - A property access on the fanout item (`users.map((u) => workflow.do(..., { userId: u.id }))`)
    was dropped from the step's inputs — `extractInputSource` resolved property
    access against the input param and output variables but not loop variables.
  - `const [org, user] = await Promise.all([...])` dropped **both** steps, because
    extraction bailed on any non-identifier binding name before reaching the
    `Promise.all` branch. Array destructuring now binds each name to its matching
    child step's output.
  - A brace-less `for (const x of xs) await workflow.do(...)` dropped the entire
    loop, since only block bodies were walked.
  - Object destructuring of a step result and multi-declarator statements now
    report a diagnostic instead of vanishing.

- 1a86d3f: Fix a fanout collapsing into a single step, and preserve graph node config.
  - A fanout took its `stepName` from the first step of its body. Node ids _are_
    step names, so the loop and that step got the same id and the step overwrote
    the loop: `await Promise.all(users.map(...))` rendered as one plain call, and
    everything after the loop became unreachable. A fanout is not itself a cached
    step, so it no longer borrows a name.
  - A `workflow.sleep` or `workflow.suspend` inside a fanout body was dropped at
    extraction — `FanoutStepMeta.body` was typed RPC-only. It now admits sleep and
    suspend, and the regenerated body emits them.
  - Regenerating a `pikkuWorkflowGraph` dropped `onError`, `retries` and
    `retryDelay` from every node, and graph-level `notes`. All four are honoured
    at runtime, so the round trip silently changed behaviour.

- 1a86d3f: Support multi-step fanout bodies in DSL workflows.

  A `Promise.all(array.map(...))` (or `for...of`) body containing more than one
  `workflow.do` call previously extracted only a single step: `const`-captured
  steps were skipped entirely by the parallel extractor, so a body like

  ```ts
  await Promise.all(
    users.map(async (u) => {
      const digestData = await workflow.do('Get pipeline', 'getDigestData', {
        userId: u.id,
      })
      await workflow.do('Send digest', 'sendDigestEmail', { ...digestData })
    })
  )
  ```

  produced a graph with `getDigestData` missing and `sendDigestEmail` referencing
  an unregistered variable. `FanoutStepMeta.child` is replaced by
  `FanoutStepMeta.body: RpcStepMeta[]`, holding the per-iteration steps inline in
  the same workflow — no sub-workflow boundary. Per-iteration `const` bindings are
  now registered so later steps in the same iteration can reference them, and the
  sequential path no longer hard-errors on bodies with more than one step.

- 1a86d3f: Add `onError` compensation to DSL workflows.

  A DSL workflow had no way to express error handling at all — `try/catch` is not
  an allowed statement, and step options carried only `retries`/`retryDelay`. A
  step can now name a compensation RPC:

  ```ts
  await workflow.do(
    'Charge',
    'chargeCard',
    { id },
    {
      retries: 3,
      onError: 'refundOrder',
    }
  )
  ```

  Semantics mirror a graph node's `onError` exactly: once the step's retries are
  exhausted the handler is invoked with `{ error: { message } }` and the original
  error is still thrown. This is compensation, not recovery — the workflow fails
  either way. The handler runs as its own durable step, so a replay cannot
  compensate twice, and it does not inherit `onError` itself.

  The handler is materialised as a real graph node, so it is wired like any other
  RPC and the console draws a dashed red "on error" edge to it rather than the
  route being invisible.

- 1a86d3f: Keep a numeric `retryDelay` numeric through the graph round-trip. The serialized
  graph typed it as `string` and the DSL→graph conversion called `.toString()`, so
  `retryDelay: 500` regenerated as `retryDelay: '500'` — a different value to the
  runtime, which parses strings as durations.
- 1a86d3f: Stop silently dropping switch cases and spread returns from workflow graphs.
  - A fall-through case (`case 'a': case 'b': ...`) recorded only the last value.
    A run entering on `'a'` therefore appeared to match no case at all. Empty
    clauses now carry through to the entry they fall into — the next non-empty
    case, otherwise `default`, otherwise the switch exit.
  - `return { ...r, extra: 1 }` produced a return node listing only `extra`, so
    the graph claimed an output shape the workflow does not have, with no
    diagnostic. `return r` produced no return node at all. `ReturnStepMeta` now
    records a `spread` list, and the regenerated code emits it.

- 1a86d3f: Stop deleting code when regenerating a DSL workflow from its graph.

  Regenerating a workflow (as the console's graph editor does) silently dropped
  steps:
  - Only the **first** step of an `if` arm survived. The walk stopped via a
    heuristic that tested whether the next node id contained `_then_`/`_else_`,
    but node ids are step names, so it never matched. Branch and switch bodies now
    walk the `next` chain up to an explicit exit boundary — the enclosing flow
    node's own `next`.
  - Switch cases emitted only their entry node, never walking `next` at all.
  - Every step was renamed to `Call <rpcName>`, because the graph conversion never
    wrote `stepName` onto the node. Step names are the durable replay cache key,
    so a round-trip silently invalidated in-flight runs.
  - `workflow.suspend()` had no graph node, yet the preceding step's `next` still
    pointed at its id — traversal dead-ended there and every following step was
    deleted. `suspend` is now a real flow node, and both `suspend` and `approval`
    have deserializer cases.
  - Numeric and boolean `switch` case values were emitted quoted (`case '1':`),
    so the case could never match. Step names and reasons containing a quote are
    now escaped.

  Also fixed in the same pass:
  - `const [org, user] = await Promise.all([...])` regenerated as a bare
    `await Promise.all([...])`, leaving both names unbound.
  - A step result assigned inside a branch was re-declared with `const` inside
    that branch, so any later reference was out of scope. Hoisting analysis was
    keyed off the same dead node-id heuristic and never fired.
  - A top-level step whose _name_ contained `_case`, `_item_`, `_then_`,
    `_else_`, `_child_` or `_default_` was silently deleted, because node ids are
    step names and were matched against those structural substrings. Ownership is
    now read from the parent constructs themselves.

- 1a86d3f: Stop corrupting values when regenerating a workflow from its graph.
  - A numeric `workflow.sleep('Wait', 5000)` came back as `'5000'`, and a numeric
    `retryDelay` likewise. Durations are `string | number`; only strings are
    quoted now.
  - An assignment to a context variable was stored as an opaque `value`, so
    `count = count + 1` regenerated as `count = 'count + 1'` — an expression
    turned into a string literal. `SetStepMeta` now carries a separate
    `expression` field (mirroring `SwitchCaseMeta`), so a string literal and a
    code expression are no longer indistinguishable in the meta.
  - A `next` that was not a single node id was coerced with a string cast: an
    array became the bogus id `'a,b'` and a branch-key record became
    `'[object Object]'`, severing every downstream node. Arrays, key-based
    routing tables and condition lists now each render in their own shape.
  - A `filter`/`some`/`every` node with no `outputVar` emitted
    `const undefined = ...`, which does not parse.

- 1a86d3f: Keep a `workflow.sleep` whose duration is only known at runtime (a loop
  variable, a field off the input). The closure evaluates it, so it is legal DSL;
  its source text is recorded as an `expression` and emitted raw when regenerating
  code, as a set step already does.
- 314ace3: Cut the schema generator's ts.Program cost — the dominant contributor to `pikku all` memory and time.

  Two independent fixes: the program is now scoped to the virtual file's import
  closure (870 source files instead of the whole tsconfig's 2572), and it is
  released once schemas are generated instead of being pinned at module scope for
  the life of the process. On a 279-function tree this cuts cold codegen ~20% and
  in-pass live heap ~21%, with byte-identical schema output.

- 3d76f51: Add an optional `docsUrl` to `wireSecret`, `wireVariable`, and `wireCredential`, so a console or deploy UI reporting a missing value can link the user to where they obtain it instead of showing a bare identifier.
- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [3d76f51]
  - @pikku/core@0.12.65

## 0.12.43

### Patch Changes

- c478794: Simplify authorization to be session + function based (#972). Permissions are now function-scoped only: global permissions AND together, a function's own permissions OR together, and the two are independent gates that both must pass — a broad global can no longer satisfy an admin-only function. Removed wire-, tag-, and HTTP-route-level permissions (`addTagPermission`, `addHTTPPermission`, wire-level `permissions` on HTTP/channel/MCP wirings). Tags are now organizational only. `auth` (session presence) and tag/HTTP middleware are unchanged.
- b714fd4: Merge an addon's credential meta into the consuming app during inspection, the
  same way addon secrets and variables are already merged. Without this, a
  credential declared by an addon (e.g. an OAuth2 integration) never reached the
  app's `CREDENTIAL_OAUTH2_CONFIGS`, so the `credential-oauth` provider and the
  credential service could not resolve it — the addon's Connect flow and status
  silently no-op'd. Addon credentials are added as fallbacks: an app-declared
  credential of the same name still wins.
- cb079cc: `pikkuAIAgent` gains a `workflows: []` capability: a referenced workflow is exposed to the LLM as a tool that runs inline and returns its output.
- 13474a6: Generate a `ScopeId` union from `wireScope` declarations.

  `pikku all` now emits `.pikku/scopes/pikku-scopes.gen.ts` with a `ScopeId` union
  of every declared scope, plus a wildcard form for each node that has
  descendants. A project's generated `pikkuFunc` narrows `scopes` to that union,
  so an undeclared scope is a compile error with editor autocomplete:

  ```ts
  wireScope({ admin: { scopes: { invoices: { scopes: { create: {} } } } } })

  pikkuFunc({
    scopes: ['admin:invoices:create'],  // ✓ autocompleted
    func: ...,
  })

  pikkuFunc({
    scopes: ['admin:invoice:create'],   // ✗ compile error (typo)
    func: ...,
  })
  ```

  The inspector independently rejects undeclared scopes, so a cast that defeats
  the compiler is still caught at build time.

  Also fixes `getArrayPropertyValue` dropping any array behind a cast — idiomatic
  `tags: ['a'] as const` was previously invisible to the inspector and silently
  omitted from meta.

- ca0d14f: Apply `credentialOverrides` when merging an addon's credentials into the consuming app, mirroring the existing `secretOverrides`/`variableOverrides` handling. Previously the credentials merge ignored overrides and always registered the addon's logical credential name, so a second instance of the same package (`wireAddon` with a `credentialOverrides` map) failed `validateCredentialOverrides` and both instances shared one OAuth provider. Now each override's resolved name is provisioned as its own credential — and since the credential name doubles as the better-auth providerId, two instances surface two distinct providers instead of a shared account pool.
- 13474a6: feat: propagate an addon's declared scopes to the host

  An addon can now declare scopes with `wireScope`, and a host that wires it picks
  them up: they merge into the host's `ScopeId` union and its declared set, so a
  host function can require an addon scope and the `pikku_scopes` foreign key
  accepts granting one. This mirrors how addon secrets and variables are loaded.

  The generated `pikku-scopes.gen.ts` now imports its metadata sidecar and derives
  `SCOPES` from it, rather than inlining the list. TypeScript only emits a `.json`
  into the build output when something imports it, and an addon publishes only
  that output — without the import, an addon's scopes never reached a host.

- cb079cc: `pikkuWorkflowGraph` nodes accept an optional `notes?: string` and the graph an optional `notes?: string[]`; notes are documentation only and excluded from `graphHash`.
- cb079cc: Fix two corpus type-check failures: n8n `graph:sort`/`graph:summarize` enum rows now emit `as const`, and the inspector's `sanitizeTypeName` prefixes an underscore when a name starts with a digit.
- 8601505: Make `wireCredential` the single source of truth for an addon's OAuth2 config: `pikku-credentials.gen.ts` exports `CREDENTIAL_OAUTH2_CONFIGS`, generated services import from it, the OpenAPI importer emits a `wireCredential`, and the inspector now extracts `oauth2.additionalParams`.
- 70fa400: Add outgoing webhooks — `webhookService.send()` enqueues signed deliveries onto a retrying queue, `@pikku/kysely`'s `KyselyWebhookService` persists per-attempt delivery history, and `@pikku/console` gains a read-only `/webhooks` page; also caches resolved secrets in `TypedSecretService` and registers inline-`func` metadata for queue/scheduler/trigger/gateway wirings.
- 3c75366: Key `secretOverrides`/`variableOverrides` on the secretId/variableId (the string the addon actually reads by — its typed map is keyed by id, e.g. `getSecret('MAILGUN_CREDENTIALS')`), not the logical meta name. The runtime aliaser already keys on the id, but the inspector merge + validation keyed on the logical name, so a correctly-keyed override failed validation and never provisioned its target whenever an addon's logical name differed from its id (the common case — `mailgun`/`MAILGUN_CREDENTIALS`). The existing test masked it by using a secret whose name equalled its id. The merge now resolves and provisions by id (with a name-fallback for older meta), validation checks ids, and the console install codegen generates overrides keyed by id.
- 7b2ea23: `wireAddon` can install one addon package as multiple named instances, each with its own per-instance singleton services and `secretOverrides`/`variableOverrides`/`credentialOverrides` that alias logical names to real project secrets/variables/credentials.
- 13474a6: Extract `wireScope` declarations and validate scope references.

  Functions referencing a scope that no `wireScope` declares now fail the build
  with an `INVALID_VALUE` critical listing the available scopes, so a typo like
  `admin:invoice:create` is caught at codegen rather than at runtime.

  `wireScope` declarations wrapped in a cast (`as const`, `as any`) are unwrapped
  before extraction rather than being silently skipped.

- d2a6eea: Add `wireRemoteAddon` — consume a hosted addon's `remote: true` RPCs transparently over HTTP, with the addon installed as a devDependency (types only). `rpc('ns:fn', input)` dispatches to the host's `/remote/rpc/:rpcName`, authenticating as a client with a token bound from a local source (`{ credentialId }` per-user, `{ secretId }` platform, or a custom `resolve()`), or omitted for a public surface. This is any-machine → hosted-library client auth, distinct from the trusted mesh (`PIKKU_REMOTE_SECRET`). A new `.remote.gen.d.ts` RPC map exposes only the `remote: true` surface to consumers. `pikku` verify errors if a `wireRemoteAddon` package is a production dependency (or missing) instead of a devDependency, and if a bound `credentialId`/`secretId` isn't wired.
- 30e62ee: Add `workflow.approval(reason, { schema, expiry })` — a return-valued, expiring human-in-the-loop gate that stays closed until a decision is recorded (via `workflowService.approveStep` or `POST /workflow/:workflowName/approve/:runId`), unlike the one-shot `workflow.suspend()`.
- Updated dependencies [7ab5287]
- Updated dependencies [e86bc17]
- Updated dependencies [a9b96a0]
- Updated dependencies [3f7fc54]
- Updated dependencies [c478794]
- Updated dependencies [3f04ae4]
- Updated dependencies [90d9f04]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [0a7db82]
- Updated dependencies [981c4db]
- Updated dependencies [13474a6]
- Updated dependencies [5a2b0d5]
- Updated dependencies [13474a6]
- Updated dependencies [ee040dc]
- Updated dependencies [cb079cc]
- Updated dependencies [13474a6]
- Updated dependencies [9f0d0eb]
- Updated dependencies [13474a6]
- Updated dependencies [70fa400]
- Updated dependencies [7b2ea23]
- Updated dependencies [1dc77d5]
- Updated dependencies [416606c]
- Updated dependencies [d2a6eea]
- Updated dependencies [30e62ee]
  - @pikku/core@0.12.64

## 0.12.42

### Patch Changes

- 854c342: Fix workspace addon integration: exclude nested pikku projects from inspection (prevents "More than one CoreUserSession/CoreConfig found" when a workspace addon is linked), widen the generated addon service `call()` data param to `unknown` so schema-less function inputs compile, and add `@pikku/inspector` + `@standard-schema/spec` to the generated addon devDependencies so its `.pikku` gen files typecheck.

## 0.12.41

### Patch Changes

- bb65430: Fail codegen with a clear error when the installed `@pikku/core` violates the CLI's peer range (PKU718).

  Some package managers (bun, yarn) install straight past an unsatisfied `peerDependencies` range instead of failing, so `@pikku/cli` could end up next to a `@pikku/core` outside the range it declares — and the only symptom was a cryptic missing-export crash deep in codegen or at runtime (e.g. `The requested module '@pikku/core/dev' does not provide an export named 'reloadGeneratedMeta'`).

  The existing preflight that catches a _split_ core (two installed versions, `PKU717`) now also validates the _single_ installed core's version against the CLI's own `@pikku/core` peer range, and fails with the exact versions and the fix (`@pikku/cli` and `@pikku/core` move together — bump both to the same release, update any overrides/resolutions pins, reinstall). Set `PIKKU_ALLOW_CORE_SKEW=1` to downgrade the failure to a warning if you have verified the installed pair is compatible, mirroring `PIKKU_ALLOW_DUPLICATE_CORE`.

- 982d3f5: Webhook gateway routes are now fully compiled instead of runtime-registered. The inspector projects `wireGateway` into the generated HTTP and function meta (deterministic `gateway__<name>__post`/`__verify` ids), and the gateway runner no longer mutates meta state at runtime — it only registers the handler implementations at module load, like every other wire. Previously the runtime-only meta was invisible to codegen and the dev-server meta reload wiped it, 500ing every gateway request.

  Also fixes the GET verification echo: string challenges return as a raw body (platforms compare byte-for-byte; the old JSON quoting failed Meta's check), object responses stay JSON, and failed verification now throws `UnauthorizedError` (401) instead of returning 200 with an error body.

- Updated dependencies [982d3f5]
  - @pikku/core@0.12.61

## 0.12.40

### Patch Changes

- 1f3f510: Warn when a Pikku function body performs a runtime dynamic `import(...)`.

  The inspector now flags any `pikkuFunc`/`pikkuSessionlessFunc` (and friends) whose handler body contains a dynamic `import(...)` call — including nested callbacks — with the new `PKU498` diagnostic. Function bodies run on every invocation, so a dynamic import there adds per-call latency and defeats bundling/tree-shaking; the import belongs at the top of the module or in your services/`wireServices` setup instead.

  Type-only positions like `import('x').Foo` are not flagged. The rule defaults to `warn` — a printed yellow warning that does not fail the build — and is configurable via `lint.functionDynamicImport` in `pikku.config.json` (`'off'` to silence, `'error'` to make it a hard build failure), matching the existing `servicesNotDestructured`/`wiresNotDestructured` lints.

- Updated dependencies [1f3f510]
  - @pikku/core@0.12.59

## 0.12.39

### Patch Changes

- 4f92e6f: `pikku db` schema-codegen warnings are now coded diagnostics routed through the CLI logger instead of raw `console.warn`, so they participate in the existing `--fail-on-warn` gate.

  Each warning now carries a PKU code and `warn` severity: `PKU481` (JSON/JSONB column with no concrete `tsType`, degrading to `unknown`), `PKU480` (column named like a date/bool but whose DB type contradicts it), and `PKU482` (a `format` annotation ignored on a non-string column). Running `pikku db migrate --fail-on-warn` (e.g. in CI) now turns these into a hard failure, forcing the `db/annotations.ts` entry — closing the loophole where an untyped jsonb column silently degrades type-safety. Default behaviour is unchanged: the warnings still print, and only fail the build when `--fail-on-warn` is set.

- daec082: Drop Node 22 support — the minimum supported runtime is now Node 24 (LTS).

  Node 22 deadlocks `pikku dev` at `loadUserBootstrap` (tsx `register()` + `require(esm)` cycle handling on node 22.12+), and Node 20 is already below our floor. The `engines.node` requirement is raised to `>=24` across all packages, matching `.nvmrc` and the CI test matrix. Closes #751.

- ad26273: Remove 16 dormant `ErrorCode` enum entries that were defined but never emitted anywhere in the framework. These were placeholder registrations that were never wired to a diagnostic, or codes whose emission sites were removed in later refactors (e.g. `PKU901`, `PKU431`). A whole-repo audit found zero emission sites — no user could ever see them — so they only cluttered the registry and demanded docs pages for errors that cannot occur.

  Removed: `PKU300`, `PKU426`, `PKU427`, `PKU431`, `PKU488`, `PKU529`, `PKU568`, `PKU685`, `PKU715`, `PKU736`, `PKU787`, `PKU835`, `PKU836`, `PKU901`, `PKU937`, `PKU975`.

  A new guard test (`error-codes-emitted.test.ts`) fails if any `ErrorCode` value has no `ErrorCode.<NAME>` or raw `PKU###` reference in the source, so dead entries can't silently accumulate again.

- Updated dependencies [7b17b14]
- Updated dependencies [daec082]
- Updated dependencies [e0fd352]
  - @pikku/core@0.12.58

## 0.12.38

### Patch Changes

- 66f3dae: Move `@pikku/core` from `dependencies` to `peerDependencies` in the last packages that still declared it as a regular dependency.

  `@pikku/core` holds a single `pikkuState` registry and must resolve to exactly one copy at runtime — every wiring (workflows, RPCs, queue workers, middleware) registers into the copy it imports, and the runner reads the copy it imports. 35 packages already declare core as a peer for this reason; these six were the stragglers. Because they carried a regular `@pikku/core` dependency, bumping any one of them could leave a second, older core locked in a consumer's tree, splitting the registry so wirings silently fail to resolve (surfaced as `[PKU717] Multiple @pikku/core versions installed`).

  Making core a peer everywhere means the consuming app provides the one copy (the react/react-dom singleton pattern), so duplication is structurally impossible. `@pikku/core` is also kept as a devDependency in each package so it still builds/typechecks standalone.

  Backward-compatible for consumers that already list `@pikku/core` directly (every template does). A consumer that only pulled core transitively now gets a loud install-time peer warning instead of a silent runtime split — strictly better.

- Updated dependencies [ded4f90]
  - @pikku/core@0.12.54

## 0.12.37

### Patch Changes

- efb0406: Add in-process V8 precise coverage (`pikku dev --coverage` / `pikku serve --coverage`) with per-scenario attribution.
  - `@pikku/core`: new `V8CoverageService` (node:inspector precise coverage with snapshot + reset), exposed as the optional `coverageService` singleton service.
  - `@pikku/inspector`: function meta now records `bodyStart`/`bodyEnd` body spans (verbose meta only) so coverage can be mapped without a runtime TypeScript dependency.
  - `@pikku/cli`: `--coverage` on `pikku dev` and `pikku serve` starts the collector in-process; `pikku scenario run --coverage` resets/snapshots the server between flows and writes `.pikku/coverage/scenario-coverage.json` with per-scenario function coverage.
  - `@pikku/addon-console`: new exposed `takeLiveCoverage` / `resetLiveCoverage` RPCs; V8 ranges are mapped through inline source maps to original TypeScript lines (offset-based, so esbuild/tsx single-line output keeps full resolution).

- Updated dependencies [efb0406]
- Updated dependencies [fe4f5ca]
  - @pikku/core@0.12.53

## 0.12.36

### Patch Changes

- 61c9ce9: Add `actor.converse(...)` — actor agents for user journeys (#850)

  An actor can now hold a dynamic, LLM-driven conversation with a target Pikku AI
  agent in its own persona:

  ```ts
  const verdict = await actors.pm.converse({
    agent: 'todoBot',
    task: 'Get a todo created for the launch',
    evaluate: 'A todo about the launch now exists',
  })
  // verdict: { passed, reasoning, transcript }
  // then assert deterministically as the same actor:
  const todos = await actors.pm.invoke('listTodos', {})
  ```

  The actor drives the target over the real transport (the agent's own
  `agentRun` / `agentApprove` HTTP routes, signed in as the actor), plays the
  persona from its `pikku.config.json` config, answers the agent's tool-approval
  requests in-persona (`approvals: 'in-persona' | 'always' | 'never'`), and
  returns its verdict on whether the task was met. Deterministic checks stay the
  caller's job — they already hold the actor.

  The conversation engine is transport-agnostic (persona LLM + injected target
  driver); the persona's own turns run in-process via the configured
  `aiAgentRunner` (`model` from the call or the actors-service default).

  `agent` is typed against the generated agent-name union (`keyof AgentMap`), so
  it's author-time checked and autocompleted in a typed project.

- 472a349: Rename the userflow concept to scenario (#862). `pikkuUserFlow` becomes `pikkuScenario`, `pikku userflow run/list` becomes `pikku scenario run/list`, the workflow meta flag `userFlow` becomes `scenario`, actor types are now `ScenarioActor`/`ScenarioActors`/`ScenarioActorConfig` (`createHttpScenarioActors`), pikku.config.json's `userFlows` key becomes `scenarios`, the generated actors file is `pikku-scenario-actors.gen.ts` (`createScenarioActors`), the actor sign-in secret env var is `SCENARIO_ACTOR_SECRET`, and the console's User Flows view is now Scenarios.
- Updated dependencies [61c9ce9]
- Updated dependencies [f1f39f8]
- Updated dependencies [c45e98d]
- Updated dependencies [472a349]
  - @pikku/core@0.12.52

## 0.12.35

### Patch Changes

- 7ebea62: Tree-shake addon registrations in filtered inspector states (per-unit deploy codegen).
  - `filterInspectorState` drops an addon's `wireAddonDeclarations`/`usedAddons` unless something kept actually references it (kept wiring targeting `namespace:*`, kept agent/MCP tool, or a body-level `rpc.invoke('namespace:*')` from a file that still contains a kept function). The generated per-unit bootstrap no longer imports unused addon package bootstraps — previously every deploy unit registered every addon's entire function surface, which pulled dev-only code (e.g. `@pikku/addon-console`'s static `node:fs` imports) into Cloudflare Worker bundles and failed upload with `No such module "node:fs"`.
  - Body-level `rpc.invoke()` targets are now tracked per source file (`rpc.invokedFunctionsByFile`) so wiring-level `ref()` targets no longer pin an addon into every unit.
  - `aggregateRequiredServices` computes addon parent services per used addon function (from the addon's shipped per-function `services` meta) instead of blanket-adding `addonRequiredParentServices` — and matches namespaced ids only, so bare project function names colliding with addon function names no longer force the blanket.
  - Addon builds keep per-function `services` in the shipped `pikku-functions-meta.gen.json` so parent projects can do the above; addons built before this fall back to the blanket.
  - HTTP route meta records `refTarget` for `ref('namespace:fn')`-wired routes, so per-unit filtering keeps the addon registration (and only that function's services) when the route deploys.

- Updated dependencies [7ebea62]
- Updated dependencies [e57dd65]
  - @pikku/core@0.12.51

## 0.12.34

### Patch Changes

- 92bd643: User flows in the console: workflow graph extraction now captures
  `workflow.expectEventually` steps and per-step actor names (`{ actor:
actors.x }`), workflow meta carries `actors`/`title` into the serialized
  graph, the CLI emits `user-flow-actors.gen.json` for the new
  `MetaService.getUserFlowActorsMeta()`, and the console Workflows page gains a
  Workflows / User Flows / Personas toggle. Also fixes complex-workflow graphs
  being clobbered by a duplicate basic-extraction pass after successful DSL
  extraction.
- Updated dependencies [35a9bab]
- Updated dependencies [92bd643]
  - @pikku/core@0.12.50

## 0.12.33

### Patch Changes

- 4c17f7e: user flows: actors move onto the workflow wire + `pikku userflow` command
  - Actors are no longer a singleton service: `startWorkflow(..., { actors })`
    registers them per run and they arrive on the wire —
    `func: async ({ logger }, input, { workflow, actors })`.
  - Inspector enforces user flows are pure remote stories (PKU673): a
    pikkuUserFlow func may only destructure `logger`/`config` from services.
  - New `pikku userflow run <environment> [--flows a,b] [--tags x,y]` runs flows
    against `userFlows.environments` from pikku.config.json (secret from
    USER_FLOW_ACTOR_SECRET env), refusing internal (non-actor) steps so runs
    against staging/production never touch local services; non-zero exit on
    failure. `pikku userflow list` prints names, descriptions and tags.
  - Workflow meta now carries `title` (parity with HTTP routes/functions).

- Updated dependencies [4c17f7e]
  - @pikku/core@0.12.49

## 0.12.32

### Patch Changes

- 8dfddc3: pikkuUserFlow: user flows as workflows. A complex workflow whose steps can run
  as actors over the real transport — `workflow.do(step, rpc, data, { actor:
actors.yasser })` — plus `workflow.expectEventually(...)` for polling async
  effects. Actor steps never queue and never dispatch internally, so auth
  middleware/permissions are exercised end-to-end; flows double as e2e tests and
  staged/production health checks. Ships UserFlowActor types +
  createHttpUserFlowActors (lazy sign-in via `/auth/sign-in/actor` with a
  server-held secret), inspector source `'user-flow'`, and a console badge.
- Updated dependencies [5f2c566]
- Updated dependencies [8dfddc3]
  - @pikku/core@0.12.48

## 0.12.31

### Patch Changes

- 029fe2c: Fail `pikku all` when more than one `@pikku/core` version is installed. A split
  `@pikku/core` produces two separate `pikkuState` registries at runtime, so wirings
  (workflows, RPCs, queue workers, middleware) register into one copy while the runner
  reads the other and they silently fail to resolve (e.g. `WorkflowNotFoundError` for a
  workflow that is clearly registered). The preflight scans the project's `node_modules`,
  and errors (`PKU717`) with the offending versions/paths. Override with
  `PIKKU_ALLOW_DUPLICATE_CORE=1` to downgrade to a warning.
- Updated dependencies [e9a778f]
  - @pikku/core@0.12.45

## 0.12.30

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44

## 0.12.29

### Patch Changes

- 7b5b10a: fix(workflow): include suspend steps in plannedSteps with readable displayName

  `workflow.suspend(reason)` calls now appear in the static `plannedSteps` ladder
  produced by `deriveWorkflowPlan`. Previously the inspector ignored them, so the
  runtime's `__workflow_suspend:<reason>` steps had no planned counterpart and
  the UI appended them as orphans at the bottom of the step list instead of
  showing them at the correct position.

  Changes:
  - `WorkflowPlannedStep` gains an optional `displayName` field — the human-
    readable label to show in the UI (falls back to `stepName` when absent).
  - New `SuspendStepMeta` type added to `WorkflowStepMeta`.
  - Inspector extracts `workflow.suspend('reason')` calls and emits a
    `SuspendStepMeta` step with `type: 'suspend'` and `reason`.
  - `collectNamedSteps` maps a suspend step to
    `{ stepName: '__workflow_suspend:<reason>', displayName: '<reason>' }`,
    matching the key the runtime stores so the UI can overlay live status
    onto the planned position.

- Updated dependencies [7b5b10a]
  - @pikku/core@0.12.42

## 0.12.28

### Patch Changes

- 66d43d1: Add `deploy.defaultTarget` to `pikku.config.json` to override the default deploy target ('serverless') for functions without an explicit `deploy` flag.
- a8c9e6d: feat(inspector): add PKU940 — block type casts on rpc.invoke() calls

  The inspector now emits a critical PKU940 error when `rpc.invoke()` is called
  with an `as` cast on an argument (`rpc.invoke('fn', data as any)`) or when its
  result is cast (`rpc.invoke('fn', data) as any`). Both patterns defeat Pikku's
  generated type safety and are rejected at build time.

- ba1ab08: refactor(workflow): replace `inline: false` with `workflowQueued: true` on function meta

  The per-function workflow dispatch flag has been renamed from the confusing
  negative `inline: false` to the explicit positive `workflowQueued: true`.
  Two companion fields are also added: `workflowRetries` and `workflowTimeout`
  as function-level equivalents of the per-call-site `NodeOptions` fields.

  **Breaking change (patch — flag was undocumented):** rename `inline: false`
  to `workflowQueued: true` on any `pikkuSessionlessFunc` / `pikkuFunc` that
  dispatches its workflow steps via the queue.

  **Behaviour change:** a step marked `workflowQueued: true` now throws if no
  queue service is configured, instead of silently falling back to inline
  execution.

  **Bug fix:** `post-process.ts` was registering `wf-step-*` queues for every
  workflow step node; it now only registers them for steps that are actually
  `workflowQueued: true`, avoiding spurious queue resource allocation.

- Updated dependencies [ba1ab08]
  - @pikku/core@0.12.40

## 0.12.27

### Patch Changes

- 41ff485: fix(inspector): register functions in a dedicated pass before wiring resolution

  The deterministic-codegen change sorted `program.getSourceFiles()` so generated
  output is byte-identical across runs. But function registration (`addFunctions`)
  ran in the same sweep as wiring resolution (`visitRoutes`), so once traversal
  became alphabetical, a wiring file could be visited before the file that defines
  the function it references — e.g. an addon contract (`hello.contracts.ts`)
  before `hello.functions.ts` — producing a spurious `PKU559` ("No function
  metadata found for channel handler").

  Function registration now runs in its own pass (`visitFunctions`) over the
  sorted files, completing before any transport/wiring resolution, so resolution
  no longer depends on source-file order. Also sort the `register.gen.ts` schema
  imports (driven by a `Set`) so that file is stable too, and opt the PII-check
  tests into the now-opt-in classification scan.

- d2078c8: fix(inspector): make codegen output deterministic across runs

  Two sources of non-reproducible `pikku all` output are fixed:
  1. **Random placeholder ids.** Anonymous/unnamed functions and inline (non-exported) permissions were given a `__temp_${randomUUID()}` id, so a referenced-but-not-exported `pikkuPermission` const (e.g. `permissions: { admin: [requiresPlatformAdmin] }`) produced a fresh UUID in the generated meta on every run. The placeholder is now derived deterministically from the call expression's source location (relative path + start offset), still `__temp_`-prefixed so downstream name resolution is unchanged.
  2. **Unstable file-traversal order.** The two inspector sweeps iterated `program.getSourceFiles()` in glob + import-graph order, which varies run to run, so meta keys (and anything serialized in insertion order) were emitted in a different order each time — making a plain `git diff` of generated files look like functions were appearing/vanishing when the set was identical. Source files are now sorted by file name before the sweeps.

  Net effect: byte-identical generated output across repeated runs with no source changes (verified across the full `.pikku` tree of a 331-function project).

- e6fd12b: perf(inspector,cli): persist generated TS schemas to disk across runs

  `generateAllSchemas` already cached its `ts-json-schema-generator` output
  in-memory (keyed by the generated custom-types content), so the 2nd and 3rd
  inspector passes within a single `pikku all` were near-free. But the cache
  never survived the process, so every fresh `pikku all` paid the full cold cost
  of building a second TS program + running ts-json-schema-generator — on a
  331-function project that's ~2.2s, the single largest line item of a run.

  The cache is now also persisted to disk (`node_modules/.cache/pikku/ts-schemas.json`,
  gitignored by convention), keyed by a hash of the custom-types content plus the
  generator options that affect output. A warm `pikku all` whose function types
  are unchanged loads the schemas from disk and skips schema generation entirely;
  the cold first pass drops by ~3.4s in practice (it also primes the in-memory
  cache for the re-inspect passes). Zod schemas are still regenerated every run
  (already ~1ms each). Output is byte-identical to a cold run (verified across the
  full generated tree). The key is derived from the same content the in-memory
  cache uses, so any type change busts it. It also folds in the `@pikku/inspector`
  package version, so upgrading the inspector (the channel a schema-format change
  ships through) auto-invalidates every cache; `SCHEMA_CACHE_VERSION` remains a
  manual lever for in-development format changes between releases.

  Opt-out: omit `schemaConfig.cacheDir` (the CLI sets it by default).

- 244d892: perf(cli,inspector): make the data-classification scan opt-in (`pikku all --security`)

  `pikku all` was spending the bulk of its wall-clock on the data-classification
  leak check. For every function, on every inspector pass, it called
  `checker.getReturnTypeOfSignature` to infer the handler's return type and scan it
  for `Private`/`Pii`/`Secret` brands — the single most expensive type-checker
  operation. On a 331-function project that was ~7.3s (≈half the total), repeated
  across all three inspector passes, even though the scan only emits diagnostics
  and never affects generated output.

  The scan is a security lint, not codegen, so it's now **off by default** and gated
  behind a new `--security` flag (or `security: true` in the config). A plain
  `pikku all` skips return-type inference entirely; run `pikku all --security`
  (optionally with `--fail-on-error`) in CI/pre-deploy to enforce it. On the
  331-function project this cut `pikku all` from ~15.3s to ~9.6s.

  Also: the `all` command now reads back the run's recorded per-step durations and,
  under `PIKKU_TIMING=1`, prints a slowest-first timing table — making it easy to
  see where codegen time goes without adding any hot-path instrumentation.

- 940c253: Populate `plannedSteps` and `deterministic` on serialized DSL workflow graphs. For a DSL workflow with no loops (fanout), the inspector now records every named step in source order, so a UI can render the run's step skeleton up front without executing it or hand-listing steps. `deterministic` is `true` only for a flat, loopless, branch-free workflow (exact sequence known ahead of time); a branchy-but-loopless workflow lists all possible steps with `deterministic: false`; any fanout makes the count runtime-dependent so neither field is emitted (just `deterministic: false`). Only `source: 'dsl'` workflows are planned — `complex` step trees omit inline branches and flatten loops, so their plans would misreport determinism. The runtime already threads these fields from workflow meta onto each run via `getRun`.
- Updated dependencies [4be205f]
- Updated dependencies [061c717]
- Updated dependencies [2c55e13]
- Updated dependencies [c745c26]
- Updated dependencies [57900b5]
- Updated dependencies [72694f6]
  - @pikku/core@0.12.39

## 0.12.26

### Patch Changes

- ed548d5: fix(auth): skip the generated global `betterAuthSession()` when the user registers their own

  The CLI's `auth.gen.ts` unconditionally wired a global
  `addHTTPMiddleware('*', [betterAuthSession()])` (default map) on the stateful
  path. A project that needs a customized session bridge — `mapSession`,
  `impersonation`, `apiKey` — had to register a second global
  `betterAuthSession({...})`, leaving two in the chain; the generated default ran
  first and short-circuited (`if (session) next()`) so the custom one never took
  effect.

  The inspector now records `state.auth.hasUserSessionMiddleware` when it sees a
  user-authored **global** `betterAuthSession` registration (route-scoped and
  `.gen.ts` registrations are ignored, so regeneration never self-suppresses).
  The CLI omits its own global `betterAuthSession()` from `auth.gen.ts` when that
  flag is set — exactly one session bridge in the chain, the user's. Mirrors the
  existing stateless skip (`userStatelessSession`, #754).

## 0.12.25

### Patch Changes

- b6ba601: fix(lint): don't flag pikkuAuth's session param as a non-destructured wire

  `pikkuAuth`'s handler is `(services, session)` — the second parameter is the
  resolved user session, not a wires bag. The inspector was extracting "wires"
  from that parameter (`extractUsedWires(handler, 1)`), so a permission like
  `pikkuAuth(async ({ logger }, session) => !!session)` tripped
  `wiresNotDestructured` even though `session` cannot be destructured. pikkuAuth
  exposes no user-facing wires parameter, so no wires meta is recorded for it.

- ae7fc5d: Include gateway platform and auth fields in inspected gateway metadata.
- decdad5: fix(lint): don't fail the build on framework-synthesized functions

  The `servicesNotDestructured`/`wiresNotDestructured` defaults (`error`) were
  tripping on functions the user can't edit: generated `.gen.ts` wrappers (the
  opaque `authHandler`, the cli channel raw dispatcher) and synthetic route→addon
  bridges (`http:<method>:<route>`, no source file). `computeDiagnostics` now skips
  any function without a real, non-generated source file, so the lint only nudges
  hand-written user code. Also destructures the CLI's own `all` command.

- Updated dependencies [ae7fc5d]
- Updated dependencies [fa7a09c]
  - @pikku/core@0.12.37

## 0.12.24

### Patch Changes

- 5fe3f47: fix(better-auth): skip the auto-generated stateless session middleware when the
  project registers its own. Closes #754.

  With `session.cookieCache` enabled the CLI generates a global
  `betterAuthStatelessSession()` using the default `{ userId }` map. Because session
  middleware short-circuits once a session is set (`if (session) next()`) and the
  generated file is imported before user wirings, that default-map middleware ran
  first and **pre-empted** a project's own `betterAuthStatelessSession({ mapSession })`
  — silently dropping custom session fields (`role`, `locale`, …).

  The inspector now detects a user-owned global registration (a
  `betterAuthStatelessSession(...)` call inside `addGlobalMiddleware` or the global
  form of `addHTTPMiddleware` — the array form or the `'*'` pattern, not a
  route-scoped `addHTTPMiddleware('/path', …)`; ignoring `.gen.ts` files and bare
  standalone calls) and
  sets `state.auth.userStatelessSession`. When set, the CLI skips writing
  `auth-middleware.gen.ts` (and removes a stale one) so the project's own middleware
  — with its custom `mapSession` — is the only one registered. Projects without a
  custom map are unaffected: the default middleware is still generated.

- 3ba12ca: Stop consumed-addon parent services from polluting every per-unit deploy bundle, and stub the AI SDKs out of non-agent units.

  `aggregateRequiredServices` added `addonRequiredParentServices` (the services a consumed addon needs from its parent — e.g. `aiAgentRunner`, `deploymentService`, `metaService`) to **every** unit's `requiredServices` unconditionally. For any project that consumes an addon, this marked those services required on all units, so the per-unit service tree-shaking (and the gen-file/module stubs that key off the `false` flags) never fired — every unit shipped the full set. These parent services are now added only to units that actually deploy an addon function (its `pikkuFuncId` appears in `usedFunctions`); a unit that only calls the addon over RPC, or never touches it, no longer carries them.

  On the back of the now-honest flags, the bundler stubs the AI SDK packages (`@pikku/ai-vercel`, `@ai-sdk/*`, `ai`) out of any unit where `aiAgentRunner` is not required, via a new service→module stub map alongside the existing gen-file stub map. The shared services factory must guard runner construction behind a defined-check on the dynamic import so a stubbed unit simply skips building the runner.

## 0.12.23

### Patch Changes

- 807a8d0: Add `refHTTP` / `refChannel` / `refCLI` so a consumer can wire an addon's HTTP routes, channel actions, and CLI commands directly from the addon's published `.pikku` contract metadata — no addon source is imported and nothing is hand-wired. These mirror the existing `ref('namespace:fn')` helper: each reference resolves the addon's already-loaded contract (via `wireAddon`) and proxies every function through `ref()` (RPC) at runtime.
  - **Inspector:** `wireHTTPRoutes`/`wireChannel`/`wireCLI` now expand `refHTTP('ns:contract')` / `refChannel('ns:contract')` / `refCLI('ns:contract')` call expressions against `state.exportedContracts.addon{Http,Channel,Cli}` (already namespaced and `packageName`-tagged by `loadAddonFunctionsMeta`). An optional second argument overrides the mount basePath, e.g. `refHTTP('ext:helloRoutes', { basePath: '/ext' })`; otherwise the addon contract's own basePath is preserved.
  - **CLI codegen:** the generated `pikku-function-types.gen.ts` now emits `refHTTP`/`refChannel`/`refCLI` (exported through `#pikku`) backed by const maps built from each wired addon's contract metadata, with every function pre-bound to `ref('ns:fn')`. Type-checking and runtime wiring resolve from the same generated artifact, so a reference can never be an inert marker.
  - **Addon authoring bans:** when inspecting an addon package (`isAddon`), the inspector now raises a critical error if the addon calls a transport wiring helper (`wireHTTP`/`wireHTTPRoutes`/`wireChannel`/`wireCLI`/`wireScheduler`/`wireQueueWorker`/`wireMCPPrompt`/`wireMCPResource`/`wireTrigger`/`wireTriggerSource`/`wireGateway`/`wireAddon`) — these are the consuming app's responsibility (`PKU920`) — or if a `define*` contract carries `middleware`/`permissions`, which the consuming app applies, not the addon (`PKU921`). Service declarations (`wireSecret`/`wireVariable`/`wireCredential`) and function-level middleware/permissions remain allowed.
  - **Deploy-bundle fix:** the HTTP/channel/CLI codegen commands now always emit their wiring and meta gen files once they report the category as active (truthy return), including the contracts-only or synthetic-route case where there are no local `wireHTTP`/`addChannel`/`wireCLI` source files. The generated bootstrap imports those files unconditionally, so skipping them left per-unit deploy bundles (e.g. Cloudflare units for scheduled tasks and workflow steps) unable to resolve `pikku-http-wirings.gen.js` and failing to build.

## 0.12.22

### Patch Changes

- 06234a9: Fix DSL `Promise.all` fanout silently failing to register its child RPC (causing a runtime "Function not found").

  Two distinct causes are addressed:
  - A fanout/group captured into a variable (`const results = await Promise.all(array.map(e => workflow.do(...)))`) was dropped entirely, because the `const`-declaration path had no `Promise.all` branch — fanout handling only ran on the bare/assignment path. The declaration path now extracts fanout and parallel groups too.
  - `extractStringLiteral` threw on a `+` concatenation with a non-static operand (e.g. `'Enrich ' + (e.id ?? e.name)`), unlike a template literal (`` `Enrich ${e.id ?? e.name}` ``) which never threw. The throw was uncaught while scanning workflow invocations and aborted the run. The `+` branch now falls back to `${...}` placeholders to match template literals, and a step's cosmetic display name can no longer block RPC registration.

- 8e72c93: Exclude `node_modules` from inspector source scanning. A locally-installed addon (under the project's `node_modules`) is a dependency, not project source — scanning it double-counted the addon's own application types (`CoreConfig`/`CoreServices`/`CoreSingletonServices`) and failed `pikku all` with "More than one … found". Addons still contribute via their generated metadata, not by being re-scanned as source.
- 6645e7a: Add a severity model for coded diagnostics so security findings can surface without blocking the dev server.
  - `InspectorLogger` gains `diagnostic({ severity, code, message })` (`severity: 'warn' | 'error' | 'critical'`). `critical(code, message)` is now sugar for `diagnostic({ severity: 'critical', ... })`.
  - The CLI fails the build only on `critical` diagnostics by default. New global flags `--fail-on-error` and `--fail-on-warn` (implies `--fail-on-error`) opt into stricter gating; `--fail-on-critical` is always on.
  - Data-classification leaks (`PKU910`) are now emitted at `error` severity instead of `critical`. They are still printed, but no longer abort `pikku all` / the dev server — pass `--fail-on-error` (e.g. at deploy) to make them blocking and recommend a fix.
  - Contract-immutability drift (`PKU861`) during `pikku versions update` (run inside `pikku all`) no longer calls `process.exit(1)`. It is surfaced as an `error` diagnostic and skips saving the manifest, so a stale baseline can't crash-loop the dev server. `pikku versions check` remains the hard gate, and `--fail-on-error` makes `pikku all` block on it at deploy.

- Updated dependencies [6bca38f]
  - @pikku/core@0.12.35

## 0.12.21

### Patch Changes

- ef50347: Tree-shake the better-auth server out of non-auth units.
  - `@pikku/better-auth`: add `betterAuthStatelessSession()` — a session middleware that verifies the signed better-auth cookie cache via `better-auth/cookies` (`getCookieCache`) using only `BETTER_AUTH_SECRET`, with no `services.auth()`, DB round-trip, or full server import. Mark the package `sideEffects: false` so unused barrel re-exports drop.
  - `@pikku/cli`: when `session.cookieCache` is enabled in the better-auth config, generate the stateless session middleware into a separate `auth-middleware.gen.ts` and wire it globally, keeping the full `/api/auth/**` server only in the auth unit. Deploy artifacts (esbuild metafile + sourcemap) are now off by default; `--debug-artifacts` re-enables them.
  - `@pikku/inspector`: ensure the orphan `auth-middleware.gen.ts` (imported by nothing) is still inspected so its global `addHTTPMiddleware('*')` registration is not dropped.

  Net effect: a non-auth unit carries ~22KB (cookie-verify floor) instead of the full ~1.25MB better-auth backend.

## 0.12.20

### Patch Changes

- a027a8e: feat: emit auth provider + plugin metadata as `auth-meta.gen.json` for the console SSO page

  The enabled social providers and Better Auth plugins are now extracted statically
  and written to a generated `auth-meta.gen.json`, replacing the runtime
  `setAuthRegistry`/`getAuthRegistry` approach — so the console can show them without
  evaluating the Better Auth factory.
  - **inspector**: the `pikkuBetterAuth` inspector now reads the `plugins` array from
    the `betterAuth({ ... })` config and records each plugin id (the callee name of
    each `plugins: [organization(), bearer()]` entry) on the auth definition.
  - **cli**: `pikku auth` (and `pikku all`) emit `auth/pikku-auth-meta.gen.json` (path
    configurable via `authMetaJsonFile`) containing `basePath`, `hasCredentials`, the
    enabled `providers` (`id` + `displayName` + `secretId`), and the enabled `plugins`
    (`id` + `displayName`). The previous `setAuthRegistry(...)` runtime wiring is
    removed from the generated `auth.gen.ts`.
  - **better-auth**: exports a `PLUGIN_REGISTRY` and `pluginDisplayName(id)` helper so
    plugin ids resolve to human-readable names.
  - **core**: removes the unreleased `setAuthRegistry`/`getAuthRegistry` runtime auth
    registry (now superseded by `auth-meta.gen.json`).
  - **addon-console**: `getAuthProviders` reads `auth-meta.gen.json` and returns the
    configured providers, plugins, and `hasCredentials` flag.
  - **console**: the Auth Providers (SSO) page fetches `console:getAuthProviders` and
    marks each provider configured/unconfigured, lists email+password credentials as a
    provider, and shows the enabled Better Auth plugins.

- a027a8e: fix: address Better Auth review findings (secret/variable batch typing, auth init, guards)
  - **core**: `SecretService.getSecrets` / `VariablesService.getVariables` (and the
    Local/Typed/Scoped/AWS implementations) now return `Partial<T>`, honestly
    reflecting that missing keys are omitted at runtime rather than typing partial
    data as fully populated. `ScopedSecretService.getSecrets` now throws on a
    disallowed key instead of silently filtering it out.
  - **cli**: the generated `services.auth()` thunk clears its memoised promise on
    rejection, so a transient Better Auth/Kysely startup failure no longer
    permanently poisons auth for the process lifetime.
  - **inspector**: the `pikkuBetterAuth` export guard now requires an exported
    `const` (rejects `export let`/`export var`), matching its error message.
  - **console**: the Microsoft auth provider's `callbackId` is `microsoft` (the
    Better Auth provider id) rather than `microsoft-entra-id`.

- a027a8e: feat(auth): migrate auth integration from Auth.js to Better Auth

  The auth integration is now built on [Better Auth](https://better-auth.com)
  and ships as a single package, `@pikku/better-auth` (replacing the former
  `@pikku/auth-js`). There is exactly one auth package now.
  - `pikkuBetterAuth(async ({ secrets, variables }) => betterAuth({ ... }))` is the new
    single entry point. The CLI inspects the `betterAuth(...)` call and generates:
    - `auth.gen.ts` — a catch-all `${basePath}{/*splat}` HTTP route per method and
      a global `betterAuthSession({ auth })` middleware that bridges the Better
      Auth session into the Pikku wire session.
    - `auth-secrets.gen.ts` — `wireSecret(BETTER_AUTH_SECRET)` plus a
      `<PROVIDER>_OAUTH` secret for each configured social provider, and
      `wireVariable` for non-secret provider config (e.g. `MICROSOFT_TENANT_ID`,
      `COGNITO_DOMAIN`/`REGION`/`USER_POOL_ID`).
    - `auth.types.ts` — a typed `pikkuBetterAuth` re-export.
  - `add-auth` (inspector) walks into the `betterAuth(...)` options to discover the
    configured providers and required secrets/variables.
  - The auth secret is now auto-wired by codegen from `BETTER_AUTH_SECRET` — it no
    longer needs to be registered as a JWT signing key in `services.ts`.

  CLI fix included: scaffold files generated outside `srcDirectories` (e.g. an
  `auth.gen.ts` under a project's `pikku/` dir) are now added to the inspector's
  wiring files, so their routes and secret metadata are picked up. The generated
  wiring imports Pikku types via a resolved relative path instead of a hardcoded
  `#pikku` specifier, so templates without a `#pikku` import map type-check.

- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
  - @pikku/core@0.12.32

## 0.12.19

### Patch Changes

- fe70fe0: fix(db): make classified columns usable in Kysely queries and emit real zod

  Two fixes so data-classified DB columns (`@private`/`@pii`/`@secret`, default
  `private`) are usable end-to-end instead of poisoning ordinary app code:
  1. **Brand marker is now optional** (`{ readonly __classification__?: ... }`)
     in both `@pikku/core` and the `pikku db migrate` schema header. A required
     marker made a plain value (e.g. `string`) unassignable to a branded column
     (`Private<string>`), breaking every Kysely `where`/insert/`.set()` operand —
     any project with classified columns failed to type-check. Optional keeps the
     brand structurally present (so the inspector's PKU910 output check still
     detects it) while letting plain values flow IN. The inspector's level read is
     now union-aware (`'pii' | undefined`) so pii/secret no longer silently
     downgrade to private.
  2. **Zod codegen resolves classified `ColumnType<>`** to proper scalars instead
     of `z.unknown()`. `pikku db migrate` emits `<Table>Z`/`InsertZ`/`PatchZ` from
     the Select slot, unwrapping the brand and honoring insert-optionality from the
     Insert slot's `| undefined`. Public `Generated<T>`/bare/nested shapes are
     unchanged.

- Updated dependencies [fe70fe0]
  - @pikku/core@0.12.31

## 0.12.18

### Patch Changes

- 20750fd: feat(workflow): decide step dispatch purely per-function

  Workflow step execution (inline vs queue dispatch) is now decided entirely by
  the step's function `inline` flag — the workflow-level / run-level `inline`
  meta no longer participates in per-step dispatch.
  - Steps default to **inline**, so a normally-started (queue-backed) workflow
    runs its whole chain in one orchestrator pass instead of one queue
    round-trip per step.
  - A function marked `inline: false` is dispatched via the queue (its own
    worker, retry isolation). When `inline: false` but no `queueService` is
    configured, the step falls back to inline and emits a `logger.warn` instead
    of silently swallowing the misconfiguration.
  - Removed the now-unused workflow-level `inline` from `WorkflowsMeta` /
    `WorkflowRuntimeMeta`, the inspector's workflow extraction, the DSL→graph
    converter, and the deploy analyzer / service inference (which now key off
    the per-function flag). Run-level `inline` is retained: it still controls
    whether a whole run executes in-process without queue infrastructure.

- Updated dependencies [cd101a5]
- Updated dependencies [ac16265]
- Updated dependencies [a05e864]
- Updated dependencies [20750fd]
  - @pikku/core@0.12.30

## 0.12.17

### Patch Changes

- 2cf67be: Add inline option to pikkuFunc/pikkuSessionlessFunc for workflow step dispatch

  By default, workflow steps now run inline (no queue hop). Set inline: false on a function to force dispatch through the queue for that step.

- Updated dependencies [2cf67be]
  - @pikku/core@0.12.28

## 0.12.16

### Patch Changes

- 646c5a8: Fix inspector failing to extract descriptions written as string concatenation (`+`). Descriptions like `'line one ' + 'line two'` are now correctly resolved to their full value. The `checker` parameter is also threaded through `getCommonWireMetaData` so all wiring types benefit from static string evaluation.

## 0.12.15

### Patch Changes

- 0db854e: Fix workflow DSL extractor treating `x = await workflow.do(...)` as a set-step when `x` was previously declared as `null`. The referenced function is now correctly registered in `invokedFunctions` and `internalFiles`, so it appears in the generated `pikku-functions.gen.ts`.
- 8249f6f: Fix `isStringLike` to unwrap type assertion expressions (`as T` / `<T>expr`) so that `workflow.do('step', 'rpcName' as any, data)` is correctly parsed as an RPC step rather than silently dropped as an inline step. Also removes the `as any` cast from the `Emails` step in `all.workflow.ts` now that the inspector handles it, and ensures `pikku all` generates email template artifacts.
- f373a87: Fix PKU910 classification semantics and Postgres annotation propagation.

  **Inspector (`@pikku/inspector`):**
  - `findPiiPaths()` now returns `ClassifiedField[]` (path + classification level) so `private`/`pii` and `secret` brands are distinguished
  - `Secret<T>` fields are blocked in the output of all exposed functions (sessioned or not)
  - `Private<T>` / `Pii<T>` fields are only blocked in sessionless functions — authenticated (sessioned) functions may return private-classified data to their callers

  **CLI (`@pikku/cli`):**
  - Fix missing `rootDir` in the Postgres `generateSchemaTypes` call — the annotations sidecar file (`db/annotations.gen.json`) was silently ignored during Postgres migrations, causing columns annotated `@public` to remain branded as `Private<T>` in the generated schema

## 0.12.14

### Patch Changes

- 4b5c75b: feat(auth-js): wire OIDC config (issuer/tenantId) as variables, expand provider registry
  - Move `issuer` and `tenantId` out of the secret blob for OIDC providers (auth0, okta, azure-ad, keycloak, cognito, microsoft-entra-id) — they are public config URLs, not secrets. Now registered via `wireVariable` and loaded at runtime via `services.variables.get()`.
  - Expand provider registry from 13 to 31 providers: reddit, notion, instagram, zoom, figma, tiktok, threads, patreon, dropbox, bitbucket, hubspot, salesforce, atlassian, strava, keycloak, cognito, microsoft-entra-id added.
  - `serialize-auth-gen` emits `wireVariable({...})` declarations and `services.variables.get()` calls in the generated factory for OIDC providers.
  - Integration verifier exercises real `/auth/providers` endpoint with `LocalSecretService` + `LocalVariablesService`, including a spy test proving `services.variables.get('AUTH0_ISSUER')` is called at request time.

- 4b5c75b: Add end-to-end data classification for SQLite and Postgres projects.

  **Core (`@pikku/core`):** New `Private<T>` and `Secret<T>` intersection brands, `ClassificationManifest`, `ColumnClassification`, and `AnonymizeStrategy` types exported from `data-classification.ts`.

  **CLI (`@pikku/cli`):**
  - SQL comment annotations: `-- @public`, `-- @private[:strategy]`, `-- @secret[:strategy]` on `CREATE TABLE` columns and `ALTER TABLE ... ADD COLUMN` statements. Unannotated columns default to `private`.
  - `pikku db migrate` now emits a `classification.gen.ts` manifest alongside `schema.d.ts`.
  - New `pikku db audit` command — prints a per-column classification summary and warns on `private`/`secret` columns with no anonymize strategy.
  - Postgres dialect support in `resolveDb`, `PostgresMigrationExecutor`, and `PostgresIntrospector`.

  **Inspector (`@pikku/inspector`):** New PKU910 check — `findPiiPaths()` walks inferred function return types looking for `__pii__` brands (including inside `Array<T>`, `Record<K,V>`, and index signatures) and fails the build if a function exposes branded fields in its output.

- Updated dependencies [4b5c75b]
- Updated dependencies [4b5c75b]
  - @pikku/core@0.12.27

## 0.12.13

### Patch Changes

- 665bdb0: Add end-to-end data classification for SQLite and Postgres projects.

  **Core (`@pikku/core`):** New `Private<T>` and `Secret<T>` intersection brands, `ClassificationManifest`, `ColumnClassification`, and `AnonymizeStrategy` types exported from `data-classification.ts`.

  **CLI (`@pikku/cli`):**
  - SQL comment annotations: `-- @public`, `-- @private[:strategy]`, `-- @secret[:strategy]` on `CREATE TABLE` columns and `ALTER TABLE ... ADD COLUMN` statements. Unannotated columns default to `private`.
  - `pikku db migrate` now emits a `classification.gen.ts` manifest alongside `schema.d.ts`.
  - New `pikku db audit` command — prints a per-column classification summary and warns on `private`/`secret` columns with no anonymize strategy.
  - Postgres dialect support in `resolveDb`, `PostgresMigrationExecutor`, and `PostgresIntrospector`.

  **Inspector (`@pikku/inspector`):** New PKU910 check — `findPiiPaths()` walks inferred function return types looking for `__pii__` brands (including inside `Array<T>`, `Record<K,V>`, and index signatures) and fails the build if a function exposes branded fields in its output.

- Updated dependencies [665bdb0]
  - @pikku/core@0.12.25

## 0.12.12

### Patch Changes

- 9060165: Agents now declare their model directly as `<provider>/<model>` (e.g. `openai/gpt-4o`). The `models`, `agentDefaults`, and `agentOverrides` config blocks have been removed.

  **Migration:** replace any bare `model: 'alias'` values with the full provider-qualified form and remove those blocks from `pikku.config.json`.

- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
  - @pikku/core@0.12.21

## 0.12.11

### Patch Changes

- 033d172: Log a critical inspector error when multiple functions resolve to the same `pikku` function name, instead of silently allowing routing map collisions. This may cause builds to fail if multiple functions previously resolved to the same `pikku` function name.
- Updated dependencies [b9ed73e]
  - @pikku/core@0.12.19

## 0.12.0

## 0.12.10

### Patch Changes

- ba8d6ff: Support inline functions in pikkuWorkflowComplexFunc with full DSL extraction
- d3ace0e: Inspector now captures the `deploy: 'serverless' | 'server' | 'auto'` option
  from `pikkuFunc` / `pikkuSessionlessFunc` calls, alongside the other runtime
  metadata (`expose`, `remote`, `mcp`, `readonly`, `approvalRequired`).

  Previously this field was defined on `FunctionRuntimeMeta` but never read
  from the user's source, so `deploy: 'server'` was silently dropped. That
  left downstream consumers — notably `@pikku/cli`'s deployment analyzer,
  which routes server-targeted functions to a container unit — treating
  every function as `serverless` regardless of its declared intent.

- Updated dependencies [311c0c4]
  - @pikku/core@0.12.18

## 0.12.9

### Patch Changes

- 2ac6468: Fix workflow inspector crash when workflow.do() data object has a 'description' property
- fbcf5b9: Add version awareness to RPC handler: versioned functions now appear in the exposed RPC type map (e.g. `getData@v1`, `getData@v2`), enabling type-safe `rpc.invoke('getData@v1', data)` calls. Tree-shaking respects specific version filters without pulling in all versions. HTTP wirings correctly resolve versioned function IDs.
- Updated dependencies [fbcf5b9]
  - @pikku/core@0.12.16

## 0.12.8

### Patch Changes

- 624097e: Add deploy pipeline with provider-agnostic architecture
  - Add MetaService with explicit typed API, absorb WiringService reads
  - Add deployment service, traceId propagation, scoped logger
  - Rewrite analyzer: one function = one worker, gateways dispatch via RPC
  - Add Cloudflare deploy provider with plan/apply commands
  - Add per-unit filtered codegen for deploy pipeline
  - Skip missing metadata in wiring registration for deploy units
  - Fix schema coercion crash when schema has no properties
  - Fix E2E codegen: double-pass resolves cross-package Zod type imports

- Updated dependencies [9e8605f]
- Updated dependencies [624097e]
- Updated dependencies [7ab3243]
  - @pikku/core@0.12.15

## 0.12.7

### Patch Changes

- 2ce0733: Fix credential services template variable passing, duplicate body/path param collision, and add credentialOverrides to wireAddon.
- Updated dependencies [2ce0733]
  - @pikku/core@0.12.13

## 0.12.6

### Patch Changes

- 84f01ad: Add credentialOverrides to wireAddon for remapping credential names, fix credential services template to pass variables argument.
- Updated dependencies [84f01ad]
  - @pikku/core@0.12.12

## 0.12.5

### Patch Changes

- 65eccc6: Cache Zod schema generation between re-inspection passes and batch imports by source file. Schemas are cached using a fingerprint of schemaLookup entries + file mtimes, so reinspections skip Zod generation entirely when schemas haven't changed. Source file imports are grouped so each file is imported once instead of per-schema. Reduces `pikku all` from ~5 minutes to ~13 seconds on projects with many Zod schemas.
- 0f59432: Add per-user credential system with CredentialService, OAuth2 route handlers, and KyselyCredentialService with envelope encryption
- Updated dependencies [0f59432]
- Updated dependencies [52b64d1]
  - @pikku/core@0.12.10

## 0.12.4

### Patch Changes

- 5866b66: Add critical error (PKU490) when Zod schemas and wiring calls (wireHTTPRoutes, addPermission, addHTTPMiddleware) coexist in the same file. The CLI uses tsImport to extract Zod schemas at runtime, which executes all top-level code — wiring side-effects crash in this context because pikku state metadata doesn't exist. Schemas and wirings must be in separate files.
- e412b4d: Optimize CLI codegen performance: 12x faster `pikku all`
  - Reuse schemas across re-inspections (skip redundant `ts-json-schema-generator` runs)
  - Cache TS schemas to disk (`.pikku/schema-cache.json`) for cross-run reuse
  - Pass `oldProgram` to `ts.createProgram` for incremental TS compilation
  - Cache parsed tsconfig in schema generator between runs
  - Auto-include direct `addPermission`/`addHTTPMiddleware` in bootstrap via side-effect imports
  - Skip `pikkuAuth()` errors when nested inside `addPermission`/`addHTTPPermission`

- Updated dependencies [e412b4d]
- Updated dependencies [53dc8c8]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
- Updated dependencies [b973d44]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
  - @pikku/core@0.12.9

## 0.12.3

### Patch Changes

- 508a796: Fix MCP server not exposing addon tools: resolve namespaced function IDs in MCP runner, load addon schemas after schema generation, and use resolveFunctionMeta for MCP JSON serialization
- 387b2ee: Add approval description inspection, track packageName on wire metadata, and resolve addon package names in channel/RPC wirings
- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/core@0.12.3

## 0.12.2

### Patch Changes

- 3e04565: chore: update dependencies to latest minor/patch versions
- Updated dependencies [cc4c9e9]
- Updated dependencies [3e04565]
  - @pikku/core@0.12.2

## 0.12.1

### Patch Changes

- 62a8725: Rename 'external' to 'addon' throughout the codebase. All types, functions, config keys, and CLI options previously named `external` or `External` are now named `addon` or `Addon` (e.g. `ExternalPackageConfig` → `AddonConfig`, `externalPackages` → `addons`, `function-external` → `function-addon`).
- 8eed717: Add `readonly` flag to function config and runtime enforcement. Functions can be marked `readonly: true` in their config. At runtime, if a session has `readonly: true`, only functions marked as readonly can be called — otherwise a `ReadonlySessionError` (403) is thrown.
- 62a8725: `pikku versions check` now prints rich, human-readable output for all contract version errors instead of raw error codes. Each error type (PKU861–PKU865) shows the function name, separate input/output schema hashes with a `prev → current` arrow, and clear next-step instructions.

  The version manifest now stores separate `inputHash` and `outputHash` per version entry (backward-compatible — old string-hash manifests still load and validate correctly). `VersionValidateError` gains optional detail fields (`functionKey`, `version`, `previousInputHash`, `currentInputHash`, `previousOutputHash`, `currentOutputHash`, `nextVersion`, `latestVersion`, `expectedNextVersion`) for use by tooling.

- 62a8725: Replace config-based addon declarations with the new `wireAddon()` code-based API. Addons are now declared directly in wiring files using `wireAddon({ name, package, rpcEndpoint?, auth?, tags? })` instead of the `addons` field in `pikku.config.json`. The inspector reads these declarations from the TypeScript AST at build time.
- 62a8725: Add `secretOverrides` and `variableOverrides` support to `wireAddon()`. These optional maps allow an app to remap an addon's secret/variable keys to its own names (e.g. `secretOverrides: { SENDGRID_API_KEY: 'MY_EMAIL_API_KEY' }`). The inspector validates that all override keys exist in the app's own secrets/variables definitions.
- Updated dependencies [62a8725]
- Updated dependencies [a3bdb0d]
- Updated dependencies [e0349ff]
- Updated dependencies [62a8725]
- Updated dependencies [e04531f]
- Updated dependencies [62a8725]
- Updated dependencies [a83efb8]
- Updated dependencies [8eed717]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]
  - @pikku/core@0.12.1

### New Features

- AI agent metadata extraction
- HTTP route groups analysis
- Trigger and trigger source analysis
- Secret and variable declaration extraction
- Workflow graph inspection and DSL extraction
- Contract hashing for change detection
- OpenAPI spec generation (moved from CLI)

## 0.11.2

### Patch Changes

- db9c7bf: Add workflow graph inspection and DSL extraction
- Updated dependencies [db9c7bf]
  - @pikku/core@0.11.2

### Features

- f35e89da: Add workflow graph inspection and DSL extraction
  - Workflow graph inspection with `add-workflow-graph.ts`
  - DSL workflow extraction utilities (extract, deserialize, validate)
  - DSL to graph conversion for metadata generation

## 0.11.1

### Patch Changes

- 4b811db: chore: updating all dependencies
- 28aeb7f: breaking: extract docs in the wiring meta
- ce902b1: feat: adding in pikkuSimpleWorkflowFunc
- 06e1a31: breaking: change session services to wire services
- Updated dependencies [4b811db]
- Updated dependencies [e12a00c]
- Updated dependencies [4579434]
- Updated dependencies [28aeb7f]
- Updated dependencies [ce902b1]
- Updated dependencies [06e1a31]
  - @pikku/core@0.11.1

### Minor Changes

- Add workflow inspection and analysis
- Add enhanced type extraction utilities

# @pikku/inspector

## 0.10.2

### Patch Changes

- 1967172: Update code generation to support channel middleware enhancements

  **Code Generation Updates:**
  - Update channel type serialization to include middleware support
  - Improve WebSocket wrapper generation for middleware handling
  - Update CLI channel client generation with better type support
  - Enhance services and schema generation for channel configurations

  **Inspector Updates:**
  - Improve channel metadata extraction for middleware
  - Better type analysis for channel lifecycle functions
  - Enhanced post-processing for channel configurations

- 753481a: Add bootstrap command, performance optimizations, and CLI improvements

  **New Features:**
  - Add `pikku bootstrap` command for type-only generation (~13.5% faster than `pikku all`)
  - Add configurable `ignoreFiles` option to pikku.config.json with sensible defaults (_.gen.ts, _.test.ts, \*.spec.ts)
  - Export pikkuCLIRender helper from serialize-cli-types.ts with JSDoc documentation

  **Performance Improvements:**
  - Add aggressive TypeScript compiler options (skipDefaultLibCheck, types: []) - ~37% faster TypeScript setup
  - Add detailed performance timing to inspector phases (--logLevel=debug)
  - Optimize file inspection with ignore patterns - ~10-20% faster overall

  **Enhancements:**
  - Fix --logLevel flag to properly apply log level to logger
  - Update middleware logging to use structured log format
  - Improve CLI renderers to consistently use destructured logger service
  - Fix middleware file generation when middleware groups exist

- 44d71a8: fix: fixing inspector ensuring pikkuConfig is set
- Updated dependencies [ea652dc]
- Updated dependencies [4349ec5]
- Updated dependencies [44d71a8]
  - @pikku/core@0.10.2

## 0.10.1

### Patch Changes

- 778267e: fix: fixing inspector ensuring pikkuConfig is set
- Updated dependencies [778267e]
  - @pikku/core@0.10.1

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.6-next.0

### Patch Changes

- feat: running @pikku/cli using pikku
- Updated dependencies
  - @pikku/core@0.9.12-next.0

## 0.9.5

### Patch Changes

- 501c120: fix: rpc internal meta file wasn't being imported

## 0.9.4

### Patch Changes

- 6059c87: refactor: move PikkuPermission to pikkuPermission and same for middleware for api consistency to to improve future features
- 6db63bb: perf: changing http meta to a lookup map to reduce loops
- Updated dependencies [6059c87]
- Updated dependencies [6db63bb]
- Updated dependencies [74f8634]
- Updated dependencies [766fef1]
  - @pikku/core@0.9.6

## 0.9.3

### Patch Changes

- 9691aba: fix: add-functions should support both functions only and objects
- 2ab0278: refactor: no longer import ALL functions, only the ones used by rpcs
- 81005ba: feat: creating a smaller meta file for functions to reduce size
- b3c2829: fix (using ai): generating custom types broke imports.. this fixes it, but needs more robust training
- Updated dependencies [9691aba]
- Updated dependencies [2ab0278]
- Updated dependencies [81005ba]
  - @pikku/core@0.9.3

## 0.9.2

### Patch Changes

- 6cf8efd: feat: Adding PikkuDocs to function definition

  refactor: renaming APIDocs to PikkuDocs

- a5905a9: chore: updating all dependencies
- Updated dependencies [1256238]
- Updated dependencies [6cf8efd]
- Updated dependencies [d3a9a09]
- Updated dependencies [840e078]
- Updated dependencies [667d23c]
- Updated dependencies [a5905a9]
  - @pikku/core@0.9.2

## 0.9.1

### Patch Changes

- fdb1593: core: bumping everything with a patch to sync up the major release inconsistencies in dependencies
- Updated dependencies [fdb1593]
  - @pikku/core@0.9.1

## 0.9.0

### Breaking Changes

- Normalized all transports to use "wirings" instead of events/routes/transports for consistency across the framework

## 0.8.1

### Patch Changes

- 44e3ff4: feat: enhance CLI filtering with type and directory filters
  - Add --types filter to filter by PikkuEventTypes (http, channel, queue, scheduler, rpc, mcp)
  - Add --directories filter to filter by file paths/directories
  - All filters (tags, types, directories) now work together with AND logic
  - Add comprehensive logging interface to inspector package
  - Add comprehensive test suite for matchesFilters function
  - Support cross-platform path handling

- 7c592b8: feat: support for required services and improved service configuration

  This release includes several enhancements to service management and configuration:
  - Added support for required services configuration
  - Improved service discovery and registration
  - Added typed RPC clients for service communication
  - Updated middleware to run per function

- Updated dependencies [3261090]
- Updated dependencies [7c592b8]
- Updated dependencies [30a082f]
  - @pikku/core@0.8.1

## 0.8.0

### Major Features

- **Model Context Protocol (MCP) Analysis**: Added comprehensive MCP endpoint analysis
- **Queue Worker Analysis**: Added queue analysis
- **Enhanced Service Analysis**: Added service destructuring analysis for better code generation and type safety

## 0.7.7

### Patch Changes

- 8b4f52e: refactor: moving schemas in channels to functions
- Updated dependencies [8b4f52e]
- Updated dependencies [8b4f52e]
- Updated dependencies [1d70184]
  - @pikku/core@0.7.8

## 0.7.6

### Patch Changes

- faa1369: refactor: moving function imports into pikku-fun.gen file

## 0.7.5

### Patch Changes

- c5e724c: fix: rerelease as previous publish is missing something

## 0.7.4

### Patch Changes

- 598588f: fix: generating output schemas from function meta
- Updated dependencies [598588f]
  - @pikku/core@0.7.4

## 0.7.3

### Patch Changes

- 534fdef: feat: adding rpc (locally for now)
- Updated dependencies [534fdef]
  - @pikku/core@0.7.3

## 0.7.2

### Patch Changes

- 7acd53a: fix: ignore return type if it's void
- Updated dependencies [bb59874]
  - @pikku/core@0.7.2

## 0.7.1

### Patch Changes

- ebfb786: fix: only inspect function calls with pikku\*func in name

## 0.7.0

This has changed significantly. The inspector now finds all functions and then links them to events.

This means we can now get:

- RPCs out of the box
- Schemas are per function, not event
- Supports inline functions, external functions, anonymous functions

## 0.6.4

### Patch Changes

- 60b2265: refactor: supporting request and response objects
- Updated dependencies [60b2265]
  - @pikku/core@0.6.22

## 0.6.3

### Patch Changes

- c1d8381: feat: adding filtering by tags to minimize produced payload
- ee5c874: feat: moving towards using middleware for http and channels
- Updated dependencies [c1d8381]
- Updated dependencies [ee5c874]
  - @pikku/core@0.6.14

## 0.6.2

### Patch Changes

- a40a508: fix: Fixing some generation bugs and other minors
- Updated dependencies [a40a508]
  - @pikku/core@0.6.5

## 0.6.1

### Patch Changes

- f26880f: feat: extracting inspector and adding unique type references
- Updated dependencies [f26880f]
  - @pikku/core@0.6.4
