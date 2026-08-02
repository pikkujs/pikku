## 0.12.19

### Patch Changes

- 6a307f0: Fix four latent correctness bugs in the function, RPC and error runtimes, and
  remove dead code from the workflow service surface.

  `WorkflowService.getNodesWithoutSteps` is gone. It was declared on the abstract
  service and implemented by all five storage backends, and nothing ever called
  it — hence the non-core packages in this changeset, which only lose that method.

  **An RPC could execute twice.** `RPCService.invoke`, its addon path, and
  `rpcWithWire` each wrapped the _execution_ of a resolved function in a `try`
  whose `catch` treated `RPCNotFoundError` as "not found locally" and re-dispatched
  the call through `deploymentService`. A nested `rpc.invoke` to a missing name,
  raised from inside an already-running function, therefore re-ran that function on
  a remote instance after its local side effects had already committed. Resolution
  is now separated from execution on all three paths, so only a genuinely
  unresolvable name reaches the fallback. What escapes to callers is unchanged.

  **`addonNamespace` leaked between sibling calls.** The function runner's
  middleware path restored `rpc`, `functionId`, `audit` and `addonNamespace` after
  an invocation; the non-middleware path restored the first three but not the
  fourth. A call into an addon function with no middleware left the addon's
  namespace on the wire, so subsequent sibling calls resolved the wrong
  per-instance singletons and `credentialOverrides`.

  **Errors registered on a subclass never resolved.** `misc.errors` was typed
  `Map<PikkuError, ErrorDetails>` — instances — while `addError` stores
  constructors, a mismatch hidden by its `error: any` parameter. The instance
  lookup in `getErrorResponse` was consequently dead, and lookup fell through to a
  scan comparing `constructor.name`, so a subclass of a registered error got no
  status mapping at all. The map is now typed `Map<PikkuErrorConstructor, …>` and
  lookup walks the prototype chain first. Name matching is retained, deliberately,
  as the fallback that keeps error mapping working when two copies of
  `@pikku/core` are installed.

  **`createWeakUID` collided across instances.** The prefix was
  `Date.now().toString(36)` evaluated at module load, so any two instances loading
  the module in the same millisecond emitted identical `channelId` and `requestId`
  sequences — reproducibly, not just in principle. It is now seeded lazily from
  `crypto.randomUUID()`.

  Also: `pikkuState` keys its global map with `Symbol.for` rather than `Symbol`, so
  two copies of the package share registrations instead of silently getting
  disjoint state; and the local channel upgrade path no longer keys its middleware
  cache on the raw request path, which grew the cache without bound while the
  cached value never varied by path.

- afef587: Close eleven security weaknesses found in a review of `@pikku/core`. Most are
  breaking, and two invalidate data or credentials already in the wild — read the
  migration notes before upgrading.

  **Breaking: AI agent thread ownership now fails closed.** Reading, listing,
  resuming or approving an existing thread or run requires a resolved session
  principal (`userId`, or `orgId` for `sessionScope: 'org'`), regardless of the
  agent's `auth` setting. Previously a request without a session had no ownership
  model at all: the caller-supplied `resourceId` was accepted as the ownership
  key, so any caller could read or resume another party's thread by naming its
  `resourceId`. Worse, `threadOwnerConstraint` returned `undefined` for a
  sessionless caller, and `undefined` means _no filter_ rather than _no rows_ —
  so `getAgentThreads` returned every thread in the deployment. It now returns
  `string[]`, empty for a sessionless caller, which every storage backend already
  treats as matching nothing. Sessionless agents still run one-shot conversations,
  each with a fresh unguessable owner; what they lose is cross-request continuity.
  Wire a session to restore it.

  **Breaking: stored secrets and credentials must be re-entered.** `deriveKey` ran
  a single unsalted round of SHA-256 over the passphrase and used the digest
  directly as the AES-GCM key — roughly one hash per brute-force guess, with one
  rainbow table working against every deployment. It is now PBKDF2-HMAC-SHA256 at
  600,000 iterations over a random salt. There is no compatibility path: every
  value held by the kysely, mongodb and redis secret services and the kysely
  credential service becomes undecryptable. They fail loud, naming the key and
  `key_version`, so the app hard-fails on first secret read until each is re-set.

  The KEK salt is scoped to the key version and stored alongside it, rather than
  per secret, so a bulk read costs one derivation instead of N — `getSecrets` over
  50 secrets went from ~2.3s to ~48ms, and rotation from ~4.6s to ~94ms. This adds
  a salt table (kysely), hash field (redis) or collection (mongodb), created
  automatically on first use.

  **Breaking: `PIKKU_REMOTE_SECRET` must be at least 32 characters.** The
  remote-RPC session envelope moved from PBKDF2 to HKDF, which expands
  high-entropy key material rather than stretching a low-entropy passphrase. That
  took a remote hop from ~269ms to ~0.4ms — PBKDF2 was running twice per request —
  but HKDF supplies no brute-force resistance, so the secret must carry the
  entropy itself. A shorter secret now throws `WeakKeyMaterialError` at both ends.
  Generate one with `openssl rand -base64 32` and roll it out to every service in
  the mesh together: existing bearer tokens are format-incompatible, so a partial
  rollout produces 401s until every instance is updated. The Cloudflare, Lambda
  and Azure deployment services each hand-rolled a copy of `buildRemoteHeaders`
  and now call the shared one, which is what keeps the two sides in step.

  **Breaking: previously signed content URLs stop verifying.** `LocalContent`
  signed only `{signedAt, expiresAt, notBefore}`, so a signature proved when a URL
  was issued but never what it was issued for — any valid token was a skeleton
  key, and swapping the pathname from a public thumbnail to a private document
  still verified. The signature now binds the request path. Separately, the
  verifier returned "valid" when no JWT service was wired, which is how
  `pikku serve` ran: a forged `?signedAt=0&expiresAt=99999999999999` was accepted.
  It now rejects with 403, `LocalContent` requires a `JWTService`, and
  `pikku serve`/`pikku dev` mint an ephemeral per-process signing key so local
  development works without shipping a fail-open path. In-flight signed URLs must
  be re-issued.

  **Request body size limits now apply to every adapter.** The `maxBodySize` cap
  existed only in `PikkuFetchHTTPRequest`. The real hole was uWebSockets, which
  drove `res.onData` itself and concatenated every chunk with no bound and nothing
  downstream able to intervene; it now drops chunks past the limit and replies 413
  before routing. Fastify delegates to its native `bodyLimit` (set only when
  `maxBodySize` is configured, so fastify's stricter 1 MB default is never
  loosened), and `PikkuExpressServer` feeds the limit into its body parsers. Two
  paths can only reject rather than prevent, and are documented as such:
  `express-middleware` mounted on your own app receives an already-parsed body, so
  that deployment must bound its own parser; Next server actions bottom out at
  `experimental.serverActions.bodySizeLimit`.

  **Breaking: the console addon's privileged functions are gated by default.**
  `wireAddon` gains a `scopes` option that applies to every function in the
  addon's namespace, and the console scaffold now generates
  `wireAddon({ name: 'console', package: '@pikku/addon-console', scopes: ['admin'] })`.
  Previously the console's entire privileged surface — around 54 functions
  including `credentialGet`, which returns a resolved OAuth token for an arbitrary
  `userId`, `updateFunctionBody`, and `installAddon`, which shells out to a
  package install — was protected only by an optional host-registered
  `addGlobalPermission`. `resolveGlobalPermissions` returns `[]` when none is
  registered and permission checking then no-ops, so an app that never registered
  one served those functions to anyone, and with the template's default
  `scaffold.rpc: "no-auth"` that meant unauthenticated. All of them now return 403
  `MissingScopeError` without an `admin`, `admin:*` or `*` scope. **Regenerating
  is required** — an app holding an old `console.gen.ts` stays open.
  `installAddon` and `installOpenapiAddon` additionally declare their own
  `auth: true, scopes: ['admin']`, and `getAgentThreads` now scopes its listing to
  the session's own threads unless the caller holds admin.

  Addon scopes are enforced in `runPikkuFunc` rather than at the RPC boundary,
  because a wiring can reference an addon function directly — the inspector
  records the addon's `packageName` on HTTP, channel, schedule, queue, CLI,
  trigger, gateway and MCP wirings — and those paths never call `resolveNamespace`.
  Enforcing at the RPC seam would have covered only the `namespace:function` form
  while reading as complete.

  **Breaking: `wireAddon`'s `auth` and `tags` now apply on direct wirings too.**
  Both were read only by `resolveAddonFunction`, so they had exactly the hole
  scopes had: `wireAddon({ name: 'console', package: '@pikku/addon-console', auth:
true, tags: ['admin'] })` gated `rpc('console:credentialGet')` and gated nothing
  at all on an HTTP route wired straight to `credentialGet`. A consumer who
  reached for the documented way to lock an addon down got a control that was
  silently inert on every wiring except one. Both now resolve in `runPikkuFunc`.
  `auth` merges as an OR — `auth: false` from an addon is ignored on a direct
  wiring, because an addon may require a session the wiring did not but must never
  waive one it did. Addon tags resolve to concrete middleware against the **root**
  tag groups before the call rather than being folded into the function's
  inherited middleware: `addTagMiddleware('admin', …)` is written by the consuming
  app and registers under the root package, whereas `combineMiddleware` would look
  the tag up under the addon's own `packageName`, where it does not exist.

  One consequence worth naming: an addon that wires `auth: true` and also runs its
  own sessionless internal work — a scheduled task or queue worker inside the
  addon calling a sibling function — is now gated where it previously was not,
  because a bare `rpc('fn')` from inside the addon reaches `runPikkuFunc` with the
  addon's `packageName` like any other call. This reverses a decision that
  deliberately scoped the gate to the namespaced boundary; that reasoning held
  only while the boundary was real, and a direct wiring can enter an addon without
  crossing it, so "already inside" is not something the runtime can infer. Such an
  addon should carry authorization on the function via
  `pikkuFunc({ permissions })`, which has always been enforced on every path. A
  follow-up will add execution provenance so an intra-addon call can be
  distinguished from an external one and skip the addon-level check; that needs a
  marker no caller outside the process can set, which is its own design problem
  and does not belong in a security fix.

  **Codegen now warns when an exposed function has no gate (PKU574).** The
  generated `POST /rpc/:rpcName` dispatcher forwards to `rpc.exposed`, which
  refuses anything without `expose: true` — but nothing checked whether the
  target was gated, because a dispatcher cannot know what it dispatches to. The
  console shipped ~54 privileged functions through that gap and the toolchain was
  silent. The inspector now reports every function that is exposed, sessionless,
  and carries no `auth`, `scopes` or `permissions` of its own and none from a
  governing `wireAddon`. It is a `warn`, not a critical: `expose: true` on an
  ungated sessionless function is correct for a genuinely public endpoint, so it
  blocks a build only under `--fail-on-warn`.

  Two pieces of metadata were missing for this to be answerable statically, and
  both are now recorded. A `pikkuSessionlessFunc`'s own `auth: true` was read at
  runtime but never written to function meta, so a self-gated function was
  indistinguishable from an ungated one — `sessionless` carries the baseline, and
  `auth` now carries the tightening. And `wireAddon`'s `scopes`, `auth` and `tags`
  were not parsed at all: the inspector recorded the addon's `rpcEndpoint` and its
  secret, variable and credential overrides, and dropped every one of its gates.
  An addon whose gates are not statically knowable is treated as gated, because a
  false positive on a correctly-secured addon costs more than the one case it
  would catch.

  **Breaking: an application's global permissions now apply inside addons.**
  `resolveGlobalPermissions` read only the bucket matching the function's own
  package, but the generated `addGlobalPermission` wrapper takes no package
  argument and always registers under the root. An app-wide rule like "every
  request needs a signed-in user" therefore stopped at the addon boundary, and the
  bucket an addon's functions did read was one no host could write to — which is
  why the console addon's recommended `addGlobalPermission([isAdmin],
'@pikku/addon-console')` was never a gate anybody could actually install. A
  function now resolves the root bucket and its own package's, root first.
  Unioning is safe in a way nothing else here would be: globals AND, so adding the
  root ones can only tighten. Package buckets stay one-way — a package's globals
  never reach root functions, or an installed addon could gate the whole
  application. Apps with both a root global and addon-provided functions will see
  those functions gated where they previously were not.

  **Codegen now records whether each HTTP route requires a session, and warns
  about inert addon tags (PKU575).** Four separate things can demand a session —
  the function's `sessionless`, its own `auth`, the route's (or its group's)
  `auth`, and the addon it belongs to — and answering "which routes are open?"
  meant joining all four by hand and knowing which wins. Each route's meta now
  carries the resolved `requiresSession` alongside the route's own `auth`. Scopes
  count as requiring one, since they are matched against the session's and fail
  closed. Anything not statically knowable resolves to `true`, matching PKU574:
  a route that looks stricter than it is costs less than one that looks open and
  isn't. Separately, `wireAddon({ tags: ['admin'] })` reads like a gate and is
  applied like one right up until no `addTagMiddleware('admin', …)` exists, at
  which point it resolves to an empty list and gates nothing; that now warns.
  Only addon tags are reported — a tag on a function is as likely to be
  organizational, and warning about those would bury the case that matters.

  **Object-shorthand permissions were missing from meta.** The inspector visited
  `ts.PropertyAssignment` but not `ts.ShorthandPropertyAssignment`, so
  `permissions: { canAdminOrg }` — enforced identically to the longhand form at
  runtime, since `verifyPermissions` has a non-array branch — was recorded as _no
  permissions at all_. That is the most dangerous direction for meta to be wrong
  in: an audit reading it sees an open door where one is shut. It cost this review
  a false IDOR report across ~35 billing and org functions before the source
  contradicted the metadata.

  **Functions that authorize in their own body can say so.** A webhook receiver
  verifying a signature, or a handler redeeming a signed invite, is genuinely
  closed while carrying no session, scope or permission — indistinguishable in
  meta from one nobody remembered to gate, and so warned about forever by PKU574.
  `selfAuthenticated: true` on the function config records the claim and silences
  the warning for that function. It is declarative only: nothing at runtime reads
  it and it grants nothing. Detection was rejected deliberately — inferring it
  from the body means a function that _looks_ like it checks something silences
  the warning while checking nothing, and a warning that is usually wrong stops
  being read.

  **Breaking: `scaffold.<feature>` is now `boolean | { auth?, path? }`, and `true`
  means authenticated.** The old `'auth' | 'no-auth' | false` read like a
  starter-file preference while being a live authorization decision, set three
  directories from the functions it governed — the shape the console incident
  took. A surface now becomes public only by writing `{ auth: false }`, so
  omitting a field can never open anything: the failure mode of a forgotten flag
  is a locked door. `{ path }` additionally overrides where the file is
  generated, which previously could only be set for all features at once via
  `pikkuDir`.

  The legacy strings are **refused, not coerced**. `resolveScaffoldFeature` throws
  naming the key and its replacement (`"rpc": "no-auth"` → `"rpc": { "auth":
false }`), and it does so at config load, not downstream. An earlier design used
  a bare `string` for the output path, under which `"no-auth"` would have parsed
  as a file named `no-auth` and every unmigrated config would have silently
  produced nonsense; the object form makes any string invalid, so the failure is
  loud.

  The collapse is deliberately not uniform in effect. For `rpc` the flag was a
  blanket "no anonymous RPC in this app" set on a dispatcher that cannot know what
  it dispatches to; for `userAdmin` it was redundant, since the generated
  functions are already `pikkuFunc` with `scopes: ['admin:users:list']`. But for
  `agent`, `workflow`, `events` and `scenarios` it is the only gate — those
  generate real endpoints the app never authors — so `true` keeps them
  authenticated rather than opening them as a side effect of a config cleanup.
  `webhook` and `remoteRpc` have no auth dimension at all (`serialize-remote-rpc.ts`
  hardcodes `auth: false`), so an `{ auth }` on them is ignored. The three
  configs in this repo are migrated preserving their current behaviour exactly.

  **Queue job identities are signed.** A job carried the producer's `pikkuUserId`
  as a plain string and the worker resolved a session from it with no
  verification, so write access to the queue backend was act-as-any-user. The
  identity is now `pq1.<claim>.<hmac>`, HMAC-SHA256 over the claim and the
  canonicalized job payload, keyed by HKDF expansion of a new
  `PIKKU_QUEUE_IDENTITY_SECRET`. Producers opt in by wrapping their queue service
  with `SignedQueueService`. This fails safe rather than closed: with no secret
  configured the identity is dropped and jobs still process, warning once per
  process, so no existing deployment breaks on upgrade — it simply loses queue
  identity until the secret is set. The payload rather than the job id is bound
  because SQS, Cloudflare Queues, Azure and the in-memory service all mint ids
  after `add` returns.

  **Workflow inline state is read from the run record.** `isInline` consulted a
  process-local `Map`, while `WorkflowRun.inline` is durable. Any instance that
  did not start a run disagreed with the record, so one instance could dispatch a
  queued job for a workflow another was already executing in-process. It is now
  async and resolves through the durable identity, cached only when a context
  already exists so a passive reader allocates nothing. The same `Map` also leaked:
  `nextStepKey` fabricated replay state on every step, and `releaseContext`
  refused to free anything carrying it, so runs whose steps executed outside a
  `beginReplay` bracket — the step-worker queue path — stranded their context and
  step state for the process lifetime. Contexts are now released by an explicit
  execution counter. Step ordinals reset per execution rather than accumulating
  across step-worker invocations in one process, which makes step naming
  independent of how work was distributed.

  **Secret reads fail loud in every store.** `MongoDBSecretService.getSecrets`
  skipped rows that failed to decrypt, and the redis equivalent dropped every
  rejection via `Promise.allSettled`, including the "No KEK available for
  key_version N" configuration error. Both now throw, naming the key and its key
  version, matching the kysely behaviour. This matters most alongside the KEK
  change above: without it, an upgrade surfaces as a partial secrets map and an
  opaque downstream failure instead of an error naming the secret to re-enter.

  **A second middleware registration for a pattern no longer erases the first.**
  `addHTTPMiddleware`, `addTagMiddleware` and `addChannelMiddleware` groups are
  keyed by pattern or tag and held one source file each, so a second file's call
  overwrote the first's. Codegen emits its imports from what is stored, so the
  losing file was never imported and its middleware never registered — the
  runtime composes repeated registrations for a pattern happily, and only codegen
  dropped one. Adding an unrelated `addHTTPMiddleware('*', …)` to an app was
  enough to silently unregister the generated better-auth session bridge, which
  fails open and gives no sign until a request arrives without a session. A group
  now carries every registration made for it, and all of them are imported.

- Updated dependencies [6a307f0]
- Updated dependencies [afef587]
- Updated dependencies [8075f6a]
  - @pikku/core@0.12.74
  - @pikku/kysely@0.13.7

## 0.12.18

### Patch Changes

- ba6cc08: **Breaking:** the Cloudflare worker's dispatch routes now require `PIKKU_DISPATCH_SECRET`, and reject every request when it is unset.

  `POST /__pikku/queue-job` and `POST /__pikku/scheduler-job` are handled ahead of the `includesFetch` gate so a fabric Workers-for-Platforms dispatcher can deliver work to namespace scripts, which cannot bind as CF queue consumers. They had no authentication at all: anyone who could reach the worker URL could run any queue job in the deployment with an attacker-chosen payload, or trigger any scheduled task.

  Both routes now require the shared secret in the `x-pikku-dispatch` header, matching the header and env var `@pikku/node-http-server` already uses for the same contract, so one secret covers worker and container dispatch targets. The comparison is a double-HMAC through WebCrypto, which leaks neither the secret's bytes nor its length through timing. A wrong secret and an unconfigured worker both return the same bare 401.

  **Every deployment that uses these routes must set `PIKKU_DISPATCH_SECRET`** on the worker (`wrangler secret put PIKKU_DISPATCH_SECRET`) to the value its dispatcher sends. Without it the routes fail closed — queue and scheduler delivery stops — and the worker logs which variable to set. This is deliberate: falling back to unauthenticated execution is what the vulnerability was.

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

## 0.12.17

### Patch Changes

- c2d4f86: **Breaking:** the Cloudflare worker's dispatch routes now require `PIKKU_DISPATCH_SECRET`, and reject every request when it is unset.

  `POST /__pikku/queue-job` and `POST /__pikku/scheduler-job` are handled ahead of the `includesFetch` gate so a fabric Workers-for-Platforms dispatcher can deliver work to namespace scripts, which cannot bind as CF queue consumers. They had no authentication at all: anyone who could reach the worker URL could run any queue job in the deployment with an attacker-chosen payload, or trigger any scheduled task.

  Both routes now require the shared secret in the `x-pikku-dispatch` header, matching the header and env var `@pikku/node-http-server` already uses for the same contract, so one secret covers worker and container dispatch targets. The comparison is a double-HMAC through WebCrypto, which leaks neither the secret's bytes nor its length through timing. A wrong secret and an unconfigured worker both return the same bare 401.

  **Every deployment that uses these routes must set `PIKKU_DISPATCH_SECRET`** on the worker (`wrangler secret put PIKKU_DISPATCH_SECRET`) to the value its dispatcher sends. Without it the routes fail closed — queue and scheduler delivery stops — and the worker logs which variable to set. This is deliberate: falling back to unauthenticated execution is what the vulnerability was.

- Updated dependencies [384e484]
- Updated dependencies [b5a73fb]
- Updated dependencies [6be5ab0]
  - @pikku/core@0.12.72

## 0.12.16

### Patch Changes

- 8a2c993: Make the workflow service cheaper to run, and fix two ways it lost state.

  The SQL workflow tables had no indexes at all, so every step read, every
  history walk and every orchestrator tick was a sequential scan; five indexes
  now cover the columns the engine actually queries by. A replay used to ask for
  each step's row individually — O(N) reads per replay, O(N^2) over a run — and
  now takes one read of the run's steps and serves the walk from it. A step
  transition wrote the step row and its history row as two separate statements,
  so a crash between them left a step saying `succeeded` whose history still said
  `running`; both halves are now one transaction, and the history row is found by
  attempt number rather than by sorting on `created_at`, which two attempts can
  share. Resolving a dynamic workflow read and parsed every AI-generated workflow
  in the deployment to `.find()` one by name; it is a point lookup now.

  Waiting on a run no longer polls at a fixed interval. `pollIntervalMs` became a
  ceiling rather than a cadence: polling starts at 10ms and widens towards it, so
  a workflow that finishes in milliseconds is no longer held for a full second,
  and a long-running one is not read at full rate for its whole life.

  Two backend-specific defects: Redis kept a run's state as one JSON blob and
  read-modified-wrote it, so parallel branches setting different variables
  overwrote each other — state is a field per variable now, with the old blob
  still read underneath so runs in flight keep what they had. Mongo's
  `setStepScheduled` never wrote history, leaving a queued step reading as never
  dispatched.

  Also: dispatch no longer JSON round-trips every step payload before handing it
  to a queue that serialises it anyway — the in-process dev queue, which is the
  only one that was relying on it, does it itself now.

  Two more defects. A transition whose step had no live attempt wrote its status
  to the step row and silently nothing to history — the exact divergence the
  transaction exists to prevent — and now repairs the step and writes the
  missing row. And resolving a dynamic workflow was non-deterministic on all
  three backends: a name can hold several active versions, and none of them
  ordered the candidates, so which one ran could change between two calls
  reading identical data. The newest version wins, with the graph hash breaking
  a tie.

  The two attempt columns and the five indexes are declared in the workflow
  schema, so a fresh database gets them at boot. An existing one gets them from
  a migration — `pikku db generate` writes the declaration down — rather than
  from DDL issued at boot.

- a261006: **Breaking:** removed dynamic workflows — runtime-defined workflow graphs stored in the database and resolved by name instead of by codegen.

  The feature was already half-gone. Its authoring surface (`createAgentWorkflow`, `saveAgentWorkflow`, `listAgentWorkflows`, `executeAgentWorkflow`, and the AI-agent instruction builder) was deleted in April 2026 along with its entire e2e suite, and nothing has written a dynamic workflow since. What remained could not execute one either: `executeAgentWorkflow` gated on `pikkuState('workflows', 'meta')`, which only codegen ever populates, so a graph that existed solely in the database was never findable. The two backend families had also drifted onto different `source` sentinels (`'ai-agent'` vs `'dynamic-workflow'`), and the two Redis implementations disagreed on key escaping — so at least one of them matched nothing. Rather than keep shipping plumbing for a path no caller could complete, it is removed until it can be reintroduced deliberately.

  Removed:
  - `getAIGeneratedWorkflows` from `WorkflowService` and `WorkflowRunService`, and from every backend (in-memory, Redis, MongoDB, Kysely, and the Cloudflare Durable Object service and client — the last two were already a `return []` stub and a rejection).
  - The database-lookup fallbacks in `startWorkflow` and `runWorkflowJob` that resolved a workflow name against stored graphs when static meta had no match.
  - `'dynamic-workflow'` from the `WorkflowRuntimeMeta['source']` union.
  - `validateWorkflowWiring` and `computeEntryNodeIds` from `@pikku/core/workflow`. These validated AI-authored graphs and had no callers in core; the inspector keeps its own private entry-node computation for static graph wiring, which is unaffected.
  - The `workflow-created` AI stream event and its AG-UI `pikku:workflow-created` custom event. Its only emitter went with the April deletion, so it could never fire.
  - The console's `console:getAIWorkflows` RPC, the `useAIWorkflows` hook, the "Dynamic" workflow filter and badge, and the trigger-schema scraper that derived an input form from a stored graph's `$ref` bindings.

  Kept, because static graph workflows depend on them and this is not a change to versioning:
  - `upsertWorkflowVersion`, `getWorkflowVersion`, `updateWorkflowVersionStatus`, and the `workflowVersions` storage in every backend. These back version-mismatch replay: when a deployed graph's hash changes, in-flight runs continue against the exact graph they started on. No schema migration is needed — the table, its columns, and its `(workflowName, graphHash)` upsert key are unchanged.
  - `generateMermaidDiagram`, which renders any workflow graph and is not specific to dynamic ones.

  Static `pikkuWorkflowGraph` and DSL workflows are entirely unaffected: they resolve from codegen'd meta, which was always the only path that worked.

  To revive this post-MVP, the deleted authoring code is recoverable in full — its prompt engineering (a compact tool table upfront, full schemas with flattened dotted output paths returned only after a validation failure) is worth reading before rewriting:

  ```
  git show f52f3308b^:packages/core/src/wirings/ai-agent/agent-dynamic-workflow.ts
  git show f52f3308b^:packages/core/src/wirings/workflow/graph/graph-validation.ts
  git show f52f3308b --stat   # the April removal, incl. the three e2e feature files
  ```

  Note that reviving it needs more than restoring those files: the queued-step path (`executeWorkflowStep`), `onError` compensation, and sub-workflow resolution all read static meta only and would need a fallback for a graph that exists solely in the database.

- Updated dependencies [8a2c993]
- Updated dependencies [a261006]
- Updated dependencies [09973b9]
  - @pikku/core@0.12.71
  - @pikku/kysely@0.13.6

## 0.12.15

### Patch Changes

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
  - @pikku/kysely@0.13.1

## 0.12.14

### Patch Changes

- daec082: Drop Node 22 support — the minimum supported runtime is now Node 24 (LTS).

  Node 22 deadlocks `pikku dev` at `loadUserBootstrap` (tsx `register()` + `require(esm)` cycle handling on node 22.12+), and Node 20 is already below our floor. The `engines.node` requirement is raised to `>=24` across all packages, matching `.nvmrc` and the CI test matrix. Closes #751.

- Updated dependencies [7b17b14]
- Updated dependencies [daec082]
- Updated dependencies [e0fd352]
  - @pikku/core@0.12.58

## 0.12.13

### Patch Changes

- Re-release of the changes that were accidentally published as `1.0.0` (a
  changesets peer-dependency auto-major triggered by `@pikku/kysely@0.13.0`).
  `1.0.0` was unpublished; this is the same content on the `0.12.x` line.

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [241e6cf]
- Updated dependencies [41ce2cb]
  - @pikku/kysely@0.13.0
  - @pikku/core@0.12.44

## 0.12.12

### Patch Changes

- eb0bddb: fix(cloudflare): register the global singleton-services slot in setupServices

  The serverless worker entry (`createCloudflareHandler` → `WorkerEntrypoint.fetch`)
  builds singleton services via `setupServices()`, but that function only cached
  them in a module-local — it never called `setSingletonServices()`. The core
  runners reached by `runFetch`/`runQueueJob`/`runScheduled` (`fetchData` et al.)
  resolve services via the global `getSingletonServices()`, NOT the returned value,
  so every function-bearing worker threw `Error: Singleton services not initialized`
  on the first request — surfacing as a bare Cloudflare 1101 (HTTP 500) on every
  `/api/*` route. `setupServices` now registers the global slot after creating the
  services, matching what the standalone/server-target generated entries already do.

## 0.12.11

### Patch Changes

- 92cd5b1: feat(workflow): workflow-owned step retries + stable invocationId

  The workflow — not the queue — now owns step retry policy, and each step
  invocation gets a stable idempotency key.
  - **Default `retries: 5` with exponential backoff.** A step with no `retries`
    previously inherited the queue's bare default (e.g. pg-boss `retry_limit 2`,
    no backoff) so retries fired instantly and couldn't outlast a transient
    outage. Retries now default to 5 with backoff, resolved at the workflow layer.
  - **`retries: 0` is honored.** Dispatch previously passed `undefined` options
    for `retries: 0`, letting the queue re-run a non-idempotent step up to its own
    default. The resolved policy now always sets `attempts` (`retries: 0` →
    `attempts: 1`), so the queue never second-guesses the workflow. The persisted
    step retries and the dispatched `attempts` are resolved together so
    "retries exhausted" and "no more redeliveries" are the same event.
  - **`workflowStep.invocationId`** — a deterministic, dependency-free
    `uuidv5(runId:stepName)` handed to every step. Unlike `stepId` (minted per
    attempt), it is identical across retries, so a step can dedupe on it
    (`ON CONFLICT (invocationId)`, Stripe idempotency keys, etc.).
  - **queue-bullmq**: `mapPikkuJobToBull` now maps `backoff` (previously dropped,
    so a step's backoff silently never applied on Redis), and `registerQueues`
    throws a clear error when no logger is available (matching queue-pg-boss).
  - **Dispatch failures are recoverable, not fatal.** A step is now marked
    `scheduled` only _after_ it is successfully handed to its transport (queue or
    scheduler) — a failed hand-off leaves it `pending` so a replay re-dispatches
    it, instead of stranding it in `scheduled` (replay would pause forever on a
    job that was never enqueued). A transport outage (e.g. pg-boss momentarily
    down) is surfaced as a new `WorkflowDispatchException`, which the orchestrator
    treats as transient: the run is left running and the orchestrator job is
    rethrown for redelivery (it replays idempotently from the snapshot) rather
    than the whole run being marked `failed`. The orchestrator job now also
    carries its own retry policy, so this holds even when the orchestrator queue
    is configured `retry_limit 0`. A genuine step error still fails the run.
  - **Same step name can be invoked multiple times in one run.** Step rows are now
    keyed per _invocation_: the Nth reach of a step name in a replay resolves to a
    physical key (`name` for the first, `name#N` for repeats), so a literal
    duplicate name no longer clobbers the earlier step's state. The first reach
    keeps the bare name, so existing rows, graph-node matching and `invocationId`s
    are unchanged. Ordinals are derived deterministically from DSL execution order
    and reset each replay.
  - **Step provenance (`fromStepName`) + graph cycles.** Every step now records
    the predecessor it was scheduled from (`fromStepName`; entry steps have none),
    persisted on the step row across all stores (in-memory, kysely, redis,
    mongodb, cloudflare DO) and carried in the queued payload. The DSL wire
    exposes the derived `fromInvocationId` (`uuidv5(runId:fromStepName)`) so
    consumers get the stable predecessor key without a second persisted id —
    `fromStepName` is the source of truth (it is replay-deterministic; `stepId`,
    minted per row, is not). This makes the walked path reconstructable even when
    a node is reached more than once: in `a → b → a → c` the second `a` is a
    distinct ordinal instance (`a#1`) whose `fromStepName` is `b`.
    The graph runner now supports **cycles**: a forward edge into an
    already-started node still collapses to a single run (joins/diamonds are
    unchanged), but a _back-edge_ — one whose target can reach its source — fires
    a fresh ordinal instance, so a node can loop back to itself. Termination is
    the graph's responsibility (branch routing must converge); the engine enforces
    no visit cap.

- Updated dependencies [92cd5b1]
  - @pikku/core@0.12.38
  - @pikku/kysely@0.12.17

## 0.12.10

### Patch Changes

- 34f254e: Bump the `kysely` dependency range to `^0.29.0` so it dedupes onto a single
  copy alongside Better Auth (which bundles kysely 0.29.x), avoiding two
  incompatible `Kysely` classes (the `#private` brand mismatch) when both pikku's
  adapters and Better Auth share a database connection.

  kysely 0.29 is ESM-only, which the unmaintained `kysely-plugin-serialize`
  (no `exports` map, CommonJS build) cannot import. Its `SerializePlugin` is now
  maintained directly in `@pikku/kysely` and re-exported, and the external
  dependency is dropped from `@pikku/kysely`, `@pikku/kysely-sqlite`, and
  `@pikku/cloudflare`.

- Updated dependencies [6565b97]
- Updated dependencies [34f254e]
  - @pikku/kysely@0.12.16

## 0.12.9

### Patch Changes

- 595e54a: fix(cloudflare): log channel connect faults instead of silently swallowing them
- Updated dependencies [cd101a5]
- Updated dependencies [ac16265]
- Updated dependencies [a05e864]
- Updated dependencies [20750fd]
  - @pikku/core@0.12.30

## 0.12.8

### Patch Changes

- 9060165: Workflow steps now support per-step `retries` and `retryDelay` configuration. Cloudflare deployments gain Workflow Durable Object bindings for graph-DSL workflows on Workers-for-Platforms, and the deploy bundle now boots cleanly on the Cloudflare Workers runtime.
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
  - @pikku/core@0.12.21

## 0.12.7

### Patch Changes

- b1b2681: fix(cloudflare): channel unit bundle was missing the `WebSocketHibernationServer` named re-export

  Two issues blocked Workers-for-Platforms channel deploys:
  1. The CF deploy adapter generated `entry.ts` with
     `export { PikkuWebSocketHibernationServer ... } from '@pikku/cloudflare/websocket'`,
     but `PikkuWebSocketHibernationServer` actually lives in
     `@pikku/cloudflare/handler` (`/websocket` exports the abstract base
     `CloudflareWebSocketHibernationServer`). Switched the adapter import to
     `/handler`.
  2. With `bundle: true, format: 'esm'`, esbuild tree-shook the named
     re-export because nothing inside the bundle used it — leaving CF to
     reject the upload with `10070: Cannot apply new-class migration to
class 'WebSocketHibernationServer' that is not exported by script`.
     Added `sideEffects` to `@pikku/cloudflare`'s package.json marking
     `handler-factories.js` and `cloudflare-hibernation-websocket-server.js`
     as side-effectful so esbuild preserves the export.

  Together these let `wireChannel(...)` units deploy to a Workers-for-Platforms
  dispatch namespace with the DO migration accepted.

- Updated dependencies [18acebe]
- Updated dependencies [66d1b4f]
- Updated dependencies [3e35b99]
  - @pikku/core@0.12.20

## 0.12.0

## 0.12.6

### Patch Changes

- 311c0c4: Unify session persistence through SessionStore, remove session blob from ChannelStore
  - PikkuSessionService now persists sessions via SessionStore on set()/clear() instead of every function call
  - ChannelStore no longer stores session data — maps channelId to pikkuUserId only
  - ChannelStore API: setUserSession/getChannelAndSession replaced with setPikkuUserId/getChannel
  - Serverless channel runner resolves sessions from SessionStore using pikkuUserId from ChannelStore

- Updated dependencies [311c0c4]
  - @pikku/core@0.12.18
  - @pikku/kysely@0.12.10

## 0.12.5

### Patch Changes

- f90daa4: Replace workspace:_ protocol with explicit npm version ranges in all package.json files. Fixes broken publishes where workspace:_ was included literally in the npm registry.

## 0.12.4

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
  - @pikku/kysely@0.12.9

## 0.12.3

### Patch Changes

- a2ee6d0: Reject WebSocket connections on auth failure instead of always returning 101. Failed connections now close with code 1008 and return HTTP 403.
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

## 0.12.2

### Patch Changes

- 3e04565: chore: update dependencies to latest minor/patch versions
- Updated dependencies [cc4c9e9]
- Updated dependencies [3e04565]
  - @pikku/core@0.12.2

## 0.12.1

### Patch Changes

- e04531f: Code quality improvements: resolve oxlint warnings and apply autofixes across the codebase (unused bindings, unnecessary constructors, prefer `const` over `let`, etc.). No behaviour changes.
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

- `createWireServices` and `createConfig` are now optional

## 0.11.0

## 0.11.1

### Patch Changes

- 4b811db: chore: updating all dependencies
- 06e1a31: breaking: change session services to wire services
- Updated dependencies [4b811db]
- Updated dependencies [e12a00c]
- Updated dependencies [4579434]
- Updated dependencies [28aeb7f]
- Updated dependencies [ce902b1]
- Updated dependencies [06e1a31]
  - @pikku/core@0.11.1

### Minor Changes

- Workflow support

# @pikku/cloudflare

## 0.10.1

### Patch Changes

- 730adb6: Update runtime adapters for channel middleware support

  **Updates:**
  - Update Cloudflare hibernation WebSocket server for middleware changes
  - Update Fastify response convertor for improved channel handling
  - Update MCP server for channel middleware support
  - Update Next.js runtime adapter for channel improvements

- Updated dependencies [ea652dc]
- Updated dependencies [4349ec5]
- Updated dependencies [44d71a8]
  - @pikku/core@0.10.2

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.3-next.0

### Patch Changes

- Updated dependencies
  - @pikku/core@0.9.12-next.0

## 0.9.2

### Patch Changes

- 906ab7e: feat: giving eventhub service a namespace to allow multiple ones
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

## 0.8.0

- Updating to match remaining packages

## 0.7.0

- Updating to match remaining packages

## 0.6.7

### Patch Changes

- 60b2265: refactor: supporting request and response objects
- Updated dependencies [60b2265]
  - @pikku/core@0.6.22

## 0.6.6

### Patch Changes

- a234e33: fix: regressions in channels due to user session changes

## 0.6.5

### Patch Changes

- ebc04eb: refactor: move all global state into pikku state
- 8a14f3a: refactor: removing user session from channel object
- Updated dependencies [ebc04eb]
- Updated dependencies [8a14f3a]
- Updated dependencies [2c47386]
  - @pikku/core@0.6.17

## 0.6.4

### Patch Changes

- 1c7dfb6: fix: fixing some import issues
- Updated dependencies [1c7dfb6]
  - @pikku/core@0.6.15

## 0.6.3

### Patch Changes

- ee5c874: feat: moving towards using middleware for http and channels
- Updated dependencies [c1d8381]
- Updated dependencies [ee5c874]
  - @pikku/core@0.6.14

## 0.6.2

### Patch Changes

- 2bc64fd: feat: adding methods to fetch wrapper (and small fixes)
- Updated dependencies [a40a508]
  - @pikku/core@0.6.5

## 0.6.1

### Patch Changes

- 09fc52c: feat: adding cloudflare and lambda websockets
  breaking change: moved subscription from channel to services and renamed to event hub
- adecb52: feat: changes required to get cloudflare functions to work
- Updated dependencies [09fc52c]
- Updated dependencies [adecb52]
  - @pikku/core@0.6.3
