## 0.12.99

### Patch Changes

- ee9da9e: Reading an optional secret that is not set no longer makes `hasSecret` report it as set. `TypedSecretService` caches `undefined` to remember the absence, and the cache probe read that as a value.
- 7a15c9c: An actor credential is one persona's, not everyone's

  `SCENARIO_ACTOR_SECRET` was a skeleton key. Anyone holding it could post any
  `actor: true` address to `/auth/sign-in/actor` and get that persona's session —
  including the `admin` persona, which provisioning grants real admin. The browser
  switcher held it too, baked into the dev bundle as `VITE_SCENARIO_ACTOR_SECRET`,
  so "the reviewer can sign in as each kind of user" and "the reviewer's bundle is
  entitled to every persona" were the same fact.

  It is now a root that credentials derive from, never one that is presented:

  ```ts
  deriveActorSecret(root, email) // HKDF-expanded HMAC-SHA256 over the address
  ```

  The endpoint re-derives the expected value for whichever address is signing in
  and compares, so nothing is stored or looked up, a credential minted for one
  persona is refused for every other, and rotating the root invalidates all of
  them at once. The root itself is no longer a valid credential, and a root under
  32 characters refuses the endpoint rather than deriving weak credentials from
  it — the server log says why, the client is not told.

  What that buys, in the places that used to need the whole key:

  - **`pikku dev`** mints one credential per declared persona into
    `VITE_DEV_ACTOR_SECRETS` and no longer writes `VITE_SCENARIO_ACTOR_SECRET` at
    all. The root stays on the server.
  - **`pikku persona secret <id>`** mints them for anything else, and a run given
    `PIKKU_PERSONA_SECRETS=id=secret,…` can sign in as those personas and no
    others — asking for one outside the list throws naming the persona instead of
    falling back to the root.

  `useDevActors()` and `<DevActorSwitcher />` take `secrets` (one per address)
  where they took `secret`, and an actor with no credential is no longer offered
  rather than rendering a row that 401s. `HttpPersonasConfig.secret` and the
  Playwright provider's `secret` additionally accept a resolver, which is how a
  partially-credentialled run is expressed.

- ee9da9e: the surface gate measures the surface it actually ships

  The doc-quality gate went in with ceilings of 112, 823 and 10 beside a surface
  that measured 160, 1210 and 15, so it never passed on any build. Re-baselined to
  the real measurements, and the key-documentation floor earned its way from 76%
  to 79% by documenting what a caller has to put in `defineSecret`, the gateway
  message shapes, and the scorer and judge configs.

## 0.12.98

### Patch Changes

- 80eb5c0: Remove the `addMiddleware` alias of `addTagMiddleware`.

  The CLI inspector decides what registers tag middleware by matching the call's
  identifier text, so `addMiddleware(...)` compiled, exported and registered
  nothing — no error, no warning, and the middleware simply never ran. The name
  was also the one the concept-mapping skill taught.

  `addTagMiddleware` is the newer name and the scope-matched sibling of
  `addGlobalMiddleware`; the alias was reintroduced after the rename that
  established that pair.

- 2252016: Decide whether a virtual-user run is against production from the configured
  environment rather than `NODE_ENV`.

  A deployment whose staging is a production mirror runs `NODE_ENV=production`
  there too, so the old check refused every disposition on the one environment
  they exist to be used on. `startVirtualUserRun` now takes the `environments`
  generated beside the personas and the environment this process is (`PIKKU_ENV`
  by default), which is the same signal `personaEnvironmentRefusal` already
  checks at sign-in; the generated scaffold passes them. An environment that
  cannot be resolved is treated as production. `NODE_ENV` remains the answer for
  a project that configures no environments at all.

## 0.12.97

### Patch Changes

- 8154b1c: Restore the `SecretService.getSecret` JSDoc noting its failure mode, and state the `optional` carve-out `defineSecret` already documents: a key declared `optional` resolves `undefined` when absent rather than throwing. The line was on `main` and was removed by mistake in a comment cleanup on #1411 — the PR that changes what that throw says — leaving `getSecret` the only one of the interface's methods without its documented failure mode.
- 6d9c09c: Resolve a variable's declared default instead of dropping it.

  `defineVariable` takes a schema, and a schema can carry a default — `z.enum(['https://api.github.com']).default('https://api.github.com')` is the shape most addons declare their base URL with. Nothing read it. `variables.get('GITHUB_BASE_URL')` returned `undefined` on a host that had not set it, and the `as string` at the call site hid that until a request went to `undefined/repos/...`.

  The default now resolves in `TypedVariablesService`, which is the layer that knows what was declared — `VariablesService` only knows what a host put in it. A stored value always wins; a schema with no default still resolves to `undefined`.

  `VariableStatus` gains `hasDefault`, and `getMissing()` no longer lists a variable that defaults: it has a value, just not one anybody has to supply. `isConfigured` still means what it said — that a host set it.

  For this to work the generated `TYPED_VARIABLES_META` now carries the schema as a value rather than only `z.infer`-ing its type, so the schema module is retained in the emit instead of being elided.

- 239332b: Move first-party product analytics out of application code and into the framework.

  `createAnalytics<Event>({ endpoint })` in `@pikku/react` is the buffered beacon client: it is typed against the app's own event union, flushes on an interval, on size and on `pagehide`/`visibilitychange` (via `sendBeacon`, so the abandon-point events survive unload), never surfaces a failure to the user and never retries. It also carries the delegated `data-analytics-click` listener, registered in the capture phase so a component calling `stopPropagation()` cannot silence instrumentation, and merging `data-analytics-meta` from ancestors with nearest-wins. Put the client on the Pikku instance and `usePikkuAnalytics<Event>()` reaches it from the provider, alongside `usePikkuFetch` and `usePikkuRPC`.

  `requireOrigin()` in `@pikku/core/middleware` is a server-side origin lock for any unauthed route, and is re-exported from the generated `#pikku/middleware` leaf alongside `cors`. Unlike `cors()` — which only sets response headers a non-browser client ignores — it rejects with a 403 before the function body. Comparison is exact on the parsed origin, so `https://evil-myapp.com` cannot suffix-match `myapp.com`, and a missing `Origin` is rejected because a real browser always sets one on a cross-origin-capable POST. Allowed origins default to the request's own host and can be extended with a list or a resolver over services. `isAllowedOrigin` and `toOrigin` are exported for direct unit testing.

  Together these let an app keep only its event registry and its wiring, instead of a few hundred lines of copied transport.

## 0.12.96

### Patch Changes

- 88629af: Say why a hot-reload import failed instead of only that it did.

  The dev module runner caught every failure bare and returned `null`, and the reloader turned that into a single line: `Failed to import: … (keeping old code)`. Keeping the old code is the right call, but it leaves the running process disagreeing with the file on disk, and the only symptom is a function returning stale output while the editor shows the new source — `tsc` passes, every import resolves, and there is nothing anywhere to explain it.

  `run` now returns `{ ok: true, exports }` or `{ ok: false, error }`, so the failure case cannot be read past, and the reloader prints the error's message and stack under the existing line. A failure matching pikku's own documented limitation — a file using top-level `await`, which the `cjs` emit cannot express — says so outright, because in that case nothing is wrong with the file and re-reading it will never reveal that.

- f1ccfe3: A step ladder reads as one paragraph, not a list of restatements

  Every step prefixed its actor with `the `, named that actor again, and repeated
  the phase keyword. A three-step run by one person said their name three times
  and `Given` three times, only read as English when the persona key happened to
  be a role noun, and never said who that person was — the fabric template's own
  placeholder came out as `the nadia opens /app`.

  ```
  Given yasser (the founder) signs in
  When  yasser opens the dashboard
  And   sees the audit log
  And   nadia reviews the invite
  ```

  The article is gone: the actor key is the subject verbatim, so a persona named
  after a person reads as that person. A repeated phase reads as `And`, the way
  Gherkin has always written it. A step that continues both the phase and the
  actor drops the repeated subject, because English drops a repeated subject in a
  compound predicate — it takes both, since eliding across a phase change gives
  `When opens the dashboard`, and a pronoun rather than a name would give `they
sees`, step templates being authored in the third person singular.

  An actor is introduced once, by the persona's `jobTitle` — prose someone wrote
  for a reader. `roles` is authorisation, so a persona whose only description is a
  `reviewer` grant gets no introduction rather than one assembled out of grants.
  A row carries `sentenceWithRole` alongside `sentence`, set only where an actor
  is first named, so a renderer can offer the introduction as a toggle without
  parsing a composed sentence back apart.

  `{placeholder}` filling, the `#ordinal` lookup for repeated step names and an
  actorless step reading as its description alone are all unchanged.

## 0.12.95

### Patch Changes

- 1cc50ef: Queue a workflow step that names another workflow, instead of running it inside its parent.

  `dispatchStep` decided by reading `workflowQueued` off `rpc` meta, but `addWorkflow` never registers there, so a child workflow could never be queued. It always took the inline path: the parent started the child with `inline: true` and then sat in an unbounded `awaitRunEnd` poll, holding its run lock and that lock's connection until the child ended — and the child, being inline, ran its own `sleep` as a real in-process wait rather than a suspension. A parent whose child polled for fifteen minutes held two lock connections for fifteen minutes, and enough of them exhausted the lock pool and stalled every other run behind it.

  A step naming a workflow now queues whenever a queue service exists, reaching the `ChildWorkflowStartedException` path that already unwinds the parent and resumes it when the child completes. An inline parent still runs its children inline.

- a3deea4: Stop the scheduler declaring `auth: false` for every task.

  A task whose middleware sets a session runs a session-taking function, and the
  hardcoded `auth: false` made the runner log "requires a session but auth was
  explicitly disabled — use pikkuSessionlessFunc instead" on every single run.
  Nothing else changes: a task with no session still throws `MissingSessionError`
  when its function needs one.

- 2a02288: Let a virtual user run against a deployed stage.

  Until now the scaffolded run could only sign its personas in with
  `SCENARIO_ACTOR_SECRET`, which only `pikku dev` serves — so a run against a
  deployed target failed before its first turn. `runVirtualUser` now takes an
  optional short-lived Fabric operator token, handed in by whoever starts the run
  and passed through to `createPersonas` as `operator`.

  Handed in rather than fetched on demand: a stage that could ask for a token
  would be holding a credential able to mint admin sessions for itself for as long
  as the box lives. It holds one receipt, for one run, and the receipt expires. It
  is never written to the run record — only `FABRIC_OPERATOR_TOKEN` in the
  environment is read, and only as the fallback for a run nobody handed a token to.

  `HttpPersonasConfig.signInPath` now applies to the operator path too, so an app
  that mounts auth under `/api` can say so once.

  The framework's own virtual-user RPCs no longer enter a virtual user's
  catalogue. A persona whose role carries `virtualUser:*` could otherwise start
  further runs, read back every run's transcript — an adversarial run's steps are
  working exploits against the same app — and put a persona on a schedule that
  outlives it.

  The scheduled tick now runs as the platform user, and starts its runs through
  the same door a person uses.

  The scaffolded `startVirtualUserRun` RPC is gone — not the `startVirtualUserRun`
  helper `@pikku/core/virtual-user` now exports, which is the shared record-writer
  `runVirtualUser` calls. The RPC existed only so the tick could record a run
  without holding a session, which meant the persona checks, the
  production-disposition rule and the record lived in two places that would
  eventually disagree. The tick calls `runVirtualUser` over RPC instead, and the
  scaffold emits `virtualUserPlatformSession` to give it an identity:

  ```ts
  wireScheduler({
    name: 'virtualUsers',
    schedule: '0 * * * *',
    middleware: [virtualUserPlatformSession],
    func: tickVirtualUserSchedules,
  })
  ```

  `pikku-platform` is the platform's own principal and already exists for exactly
  this — a reserved user row created with no credential account of any kind, so no
  sign-in method can resolve it, and one the user directory already filters out, so
  unlike a seeded service account it costs no phantom member in any list, seat
  count or bill.

  The middleware is attached to the task rather than declared as tag middleware
  over `/rpc`, which cannot set a session at all: `runScheduledTask` builds its
  wire with a `sessionService`, so the session set here is the one the function is
  frozen with. A tick wired without it is refused for want of a session, and one
  carrying the wrong scope is refused on `virtualUser:run` — both now covered by
  tests.

  A Fabric operator can now actually start the run it signs in to start.

  `fabric()` granted its operator row `admin` and nothing else. `admin` is this
  package's own root — pikku's parent-grant rule walks down from a root that is
  held, and the virtual-user scaffold declares `virtualUser` as a root of its own
  precisely so a role can carry `virtualUser:run` without also implying
  administration. So the operator was refused by `runVirtualUser`, the one
  function the operator sign-in exists to reach.

  The operator is now granted the roots in `OPERATOR_SCOPE_ROOTS`
  (`admin`, `virtualUser`) rather than a bare `admin`. Listed rather than
  collapsed to `*`, which would make every operator a superuser on every app for
  the sake of one function: an operator still holds nothing in the application's
  own domain, and a root the app never declared is skipped rather than stored.

  The grant is also re-checked on every operator sign-in instead of only when the
  row is created. It is deliberately logged rather than thrown, so a single
  failure used to leave that operator permanently unprivileged with nothing to
  retry it, and a root added to the set later would never have reached the
  operators that already existed.

  The scaffolds no longer keep their logic inside the CLI's template strings.

  Code written as text inside a template literal is never compiled, never linted,
  and testable only by matching the source the CLI emits — so a dead branch or a
  duplicated loop survives there indefinitely. Five scaffolds were carrying real
  logic that way, and it now lives in `@pikku/core` alongside the types it uses,
  leaving each serializer to emit only what is genuinely per-application.

  - **virtual-user** — 677 lines: the run driver, the persona and disposition
    rules, the schedule writer and the serializers, now
    `@pikku/core/virtual-user`. The guarantee that an operator token never
    reaches the run record used to be a regex over emitted text; it is now
    structural, because `startVirtualUserRun` has no parameter to pass one to.
  - **workflow** — the two status streams were an ~80-line poll loop each,
    identical apart from three fields, now one `streamWorkflowRunStatus` told
    whether to be detailed. Fixes three latent bugs both copies shared: a
    `setInterval(async …)` whose poll threw produced an unhandled rejection; a
    poll that threw left the channel open rather than ending the stream; and the
    interval fired whether or not the previous poll had returned, so a slow store
    put two polls in flight and sent the init frame twice.
  - **emails** — ~190 lines of HTML escaping, trusted-root allowlist and
    single-pass substitution, now `renderEmail` in `@pikku/core/services`. This
    was the security-sensitive one, and compiling it surfaced a bug the template
    string had been hiding: `{{ content }}` was written unescaped in every render
    rather than only in the layout it is the slot for, so a caller passing
    `data.content` to a template that named it got raw HTML out. Nested lookups
    also used `in`, which walks the prototype chain; nothing inherited actually
    reached the output — every step past a prototype hit lands on a function,
    which is neither traversed nor written — so that one is a closed door rather
    than a fixed leak.
  - **agent** — both callers built the same options object; now
    `agentCallOptions`, typed against `AgentInput` rather than a second copy of
    its shape.
  - **console** — two branches that could only survive uncompiled: a catch block
    identical to its try, and an if/else whose arms were the same call.

  Behaviour is unchanged throughout, and the emitted modules are the same modules
  — the emails scaffold's ten escaping tests pass untouched through core. The five
  serializers shrink from 1,936 lines to 1,281, and what they used to emit is now
  covered by 75 tests that run the code rather than by regexes over the text.

## 0.12.94

### Patch Changes

- 0b1bf53: Provision the app a persona signs into as a grant, not just a declaration.

  `CorePersona.app` decided where a browser run navigated and nothing else, so
  "which frontend may this person reach" was a fact only the test runner held and
  the deployment could not enforce. It is now a scope: the CLI derives an `app`
  tree from the apps the personas name, and `provisionPersonas` grants
  `app:<name>` alongside the roles.

  Carried as a scope rather than a per-app column so it resolves at the session
  boundary like every other grant — revocable at runtime from the console, not
  inherited by a restricted API key, and one query for which apps a user may
  reach instead of a migration per frontend. A single-frontend product declares
  nothing and is unaffected.

  `app` is reserved as a scope root: a `defineScope` call that also declares it
  now fails the build rather than shadowing the derived tree.

## 0.12.93

### Patch Changes

- 4058c3a: `addFunction` accepts a config carrying its schemas. It typed the parameter with
  two type arguments where the schema-carrying overloads of
  `CorePikkuFunctionConfig` need five, so every generated scenario registration
  failed to typecheck — invisible until a real project was compiled in CI.
- 4058c3a: authBearer, authCookie and authAPIKey now come from `#pikku/middleware`, so nothing needs `@pikku/core`
- 4058c3a: `pikku doc` takes several topics at once, so an agent that needs two exports
  spends one round-trip rather than two.

  A variadic positional validated at runtime but not in the types: `[files...]`
  resolved to a key literally named `files...`, so declaring one was a type error.

- 4058c3a: `pikku doc` keeps a door screen to a door: exports, what each is for, and either
  its signature or a pointer to its keys — never the keys themselves. `#pikku/function`
  was 9.4k tokens and is now under 1k.

  Error classes carry their registered HTTP status again. The scrape read only the
  program, and a surveyed project consumes pikku as `.d.ts`, which has no statements —
  so all 49 came back bare.

- 4058c3a: Give every export `pikku doc` lists a line saying what it is for, and gate it at zero
- 4058c3a: Point the doc's examples at real template source instead of restating it. An `@example snippet: name` names a `// @snippet start name` region in `templates/functions` or `templates/function-addon`, and the surface build resolves it — so every example the doc shows is code that compiled, and renaming an option breaks the build rather than the docs. `wireHTTP`, `wireChannel`, `wireScheduler`, `wireQueueWorker`, `defineSecret`, `defineVariable` and `addError` now carry one.
- 114c079: Answer 401, not 403, when a function requires a session and no session exists.

  `MissingSessionError` has been in the error table at 401 since forever and was never thrown — the runner threw `ForbiddenError('Authentication required')` instead, so "you are not signed in" and "you are signed in but not allowed" both came back 403. The two mean opposite things to a client: the first is worth retrying after re-authenticating, the second never is.

  That made pikku's own recovery unreachable. `HttpPersona` re-logs-in once on a 401 mid-run, for exactly the case its comment describes — a long run outliving its session. Against a stage using `betterAuthStatelessSession`, the signed cookie cache expires on the app's `cookieCache.maxAge` (5 minutes is the common setting), and from that moment every RPC in the run failed with 403 "Authentication required" while the retry watched for a 401 that could never arrive. A 32-minute scenario run failed everything after its first five minutes.

  Permission and scope denials are untouched and stay 403.

- 4450b2a: Name the missing key when a secret is not found.

  Every `SecretService` threw a bare `Requested secret not found`. In a deployed
  runtime the stack is minified, so the message was the only evidence there was —
  and it identified neither the key nor the service. Each implementation now names
  the key it looked for; the better-auth middlewares that skip on an absent secret
  match the prefix through one shared predicate instead of the whole string.

- 4058c3a: Every `@example` in the public surface now names a snippet from `examples/online-shop`,
  and `@pikku/cli` ships the regions themselves as `snippets.json` beside `surface.json`.

  One running application is the only source: the code a reader is shown is code that
  compiles, migrates and passes `pikku` in CI, and it cannot drift from the API it
  illustrates. 80 of the 85 app-entrypoint callables now carry an example, up from 34.

- 4058c3a: Say what each wiring key is for, and gate it so it stays said

  The public surface doc listed keys as a name and a type. `schedule: string`
  is a shape; what a caller needs is that it wants a cron expression. Written
  as JSDoc where the type is declared, it reaches `pikku doc`, the IDE and the
  console at once — 31% of keys carried one, now 64%.

  `CoreHTTPFunctionWiring` was six near-identical union branches, so its keys
  could not be documented once. It is now a shared object intersected with the
  two unions that are genuinely correlated: `auth` with the kind of function it
  admits, and the method with `sse` and `query`.

  A test reads the shipped surface and holds three numbers: keys that say what
  they are for can only go up, and references to a `Core*` internal or to a type
  the doc never describes can only go down.

  Drops `eventChannel` from HTTP wirings and `graph` from triggers; nothing read
  either.

## 0.12.92

### Patch Changes

- b521f1b: Resolve the persona to impersonate during the fabric operator sign-in.

  `POST /sign-in/fabric` now takes an optional
  `actAs: { email, name?, create?, role? }`
  and returns `actAs: { userId }` — the stage's own id for that address, looked up
  before creating and created only when asked.

  It has to happen there. Impersonation names a user id, a persona only knows an
  email, and since better-auth's `admin()` plugin was dropped no HTTP endpoint
  lists users — so the two calls the scenario runner made to resolve one
  (`/auth/admin/list-users`, then `/auth/admin/create-user`) had nothing left to
  reach and every deployed persona failed with `YOU_ARE_NOT_ALLOWED_TO_LIST_USERS`.
  The adapter is already in hand on the sign-in request and the operator token has
  already been verified, so the lookup is free and gated by the same check that
  mints the session.

  A created row gets a `role` only when the caller names one. pikku has no `role`
  column of its own any more, but an app may still run better-auth's `admin()`
  plugin and constrain that column, so the persona's first role is passed through
  for those.

  `OperatorSignInOptions.adminPath` is removed; nothing points at it any more.

  A Fabric operator row now also satisfies the default impersonation gate.
  `fabric()` grants the `admin` scope only when handed a `ScopeService`, and no
  app template wires one — so the operator signed in holding nothing and every
  impersonated request fell back to the operator's own session. The `fabric`
  column is written by nothing but that sign-in, after an RS256 verification
  against the stage's public key, so the row's existence is the authorization.
  The scope half of the gate still fails closed.

## 0.12.91

### Patch Changes

- 09aff02: Let personas run against a deployed stage.

  A persona could only ever sign in through the actor plugin, which is
  passwordless and therefore a local-development mechanism — so the scenario
  suite had no way to reach staging or production, including the parts of it
  that never assert anything about a logged-in user.

  `HttpPersonasConfig` now takes `operator` as an alternative to `secret`. Given
  Fabric operator credentials, a persona signs in at `/auth/sign-in/fabric` and
  acts as its account through the `x-pikku-impersonate-user-id` header, which is
  gated on the umbrella `admin` scope rather than `user.role`. Nothing on the
  deployed side holds a test credential: the stage verifies operator tokens and
  cannot mint them.

  Provisioning stays opt-in (`createMissing`), so pointing a run at a live
  environment never quietly writes user rows into it.

## 0.12.90

### Patch Changes

- 3c0012c: Gate console agent-thread reads and deletes on thread ownership, claim MongoDB workflow steps atomically, and reach the deployment fallback from `rpcWithWire`

  `getAgentThreadMessages` and `deleteAgentThread` in the console addon took a
  caller-supplied `threadId` straight to storage, while their siblings
  `getAgentThreads` and `getAgentThreadRuns` already filtered to what the session
  owns. Both now carry an `isThreadOwner` permission: an admin reaches any thread,
  everyone else only their own, and a missing thread is refused rather than 404'd
  so it is indistinguishable from someone else's.

  `MongoDBWorkflowService` claimed a step by reading its status and then writing
  it, under a `withStepLock` that is a pass-through — so two dispatches racing for
  the same step could both proceed and run a side-effecting step twice. The claim
  is now a single status-guarded update, atomic on one document.

  `rpcWithWire` threw `RPCNotFoundError` for any unresolved namespaced call
  instead of falling through to the deployment service, so a namespaced RPC that
  `rpc()` would have dispatched remotely failed when called with an explicit wire.

- 05e47cf: fix(personas): sign a persona in before it converses, not after a 401

  `HttpPersona.converse` left authentication to `postAgent`'s 401-retry, which
  only fires on a route that refuses an anonymous caller. An agent route wired
  without `auth: true` never refuses one: turn one is accepted and the thread is
  minted under a fresh anonymous id, turn two arrives under a different anonymous
  id, and the persona is told the thread belongs to somebody else — intermittently,
  because it depends on which turn the retry happened to run on.

  The persona now logs in before the first turn if it has not already. A persona
  is a declared account with real credentials in every case, so there was never a
  run where conversing as nobody was what was wanted; the sign-in is the same one
  `call` has always done, just no longer conditional on the server pushing back.

- cfd364a: Remove the last `@pikku/core/ecosystem` references and guard against new ones

  `@pikku/kysely`'s workflow-service test still imported `StepState` from
  `@pikku/core/ecosystem/workflow`, a subpath that no longer exists in
  `@pikku/core`'s `exports`. Nothing caught it: the import is type-only, so tsx
  erases it before it can fail at runtime, and the package tsconfig excludes
  `**/*.test.ts`, so `yarn tsc` never saw it either. It now imports from
  `@pikku/core/workflow`.

  A new guard test in `@pikku/core` scans the repository for the dead specifier
  and fails if one comes back, so the next stale import is a red test rather than
  a silent `any`.

- 05e47cf: fix(virtual-user): offer agents under the name the server can resolve

  `reachableAgents` named each offered agent `agent.name ?? id`, where `id` is the
  key the agent is registered under and `agent.name` is the display label from its
  config. Those are the same string only by coincidence. `addAgent` stores the
  export's own name and `resolveAgent` looks the call up by it, so an agent
  exported as `adminAgent` and declaring `name: 'admin-agent'` was advertised to a
  virtual user as `admin-agent` — a name nothing has ever registered. The persona
  took the offer on its first turn, the stage answered
  `500 AI agent not found: admin-agent`, and the run died there. Every fixture in
  the tests happened to use one string for both, so nothing caught it.

  The offered name is now always the registration key. `AgentReachability.name` is
  gone rather than ignored, so there is no longer a display label sitting in the
  shape inviting the same mistake.

- 05e47cf: feat(virtual-user): keep the transcript a run already produced

  The engine returns `intents` and `steps` on every run — what the user set out
  to do, and every turn it took getting there — and `VirtualUserRunOutcome` kept
  neither. The record held counts and findings, so the one question anybody
  actually asks of a completed run ("what did it _do_?") had no answer anywhere,
  even though the answer had been computed and thrown away a moment earlier.

  `VirtualUserRunOutcome` now carries both, and `VirtualUserRunStore` gains a
  `steps(runId, options?)` read. Intents ride on the run record: there are a
  handful of them and every read of the run wants them. Steps get their own
  `virtualUserRunStep` table, because a run at a 500-step budget carries more
  transcript than every other column together and `list()` would pay for it on
  every row.

  Three things the kysely store had to get right, all of them driver differences
  rather than design:

  - steps are inserted in chunks of 50, because a bare sqlite driver binds at
    most 999 variables per statement and ten columns times a 500-step budget is
    five thousand — an un-chunked insert fails on long runs, which are the
    interesting ones;
  - `ok` is stored as 0 or 1, since a bare driver cannot bind a boolean at all
    and `SerializePlugin` is not installed everywhere;
  - `response` is stored JSON-encoded, because a truncated API response usually
    starts with a brace and `SerializePlugin` would otherwise read it back as an
    object rather than the string the engine saw.

  Completing a run that does not exist no longer writes steps: there is no
  foreign key to refuse them and nothing would ever read or reap them.

  **This adds a table to the `virtualUser` schema**, and the runtime creates
  nothing: a database that already has `virtualUserRun` gets the store's own
  refusal at startup until `pikku db generate` writes the migration and
  `pikku db migrate` applies it. Landing it now costs nothing, because
  `scaffold.virtualUser` is not yet switched on anywhere.

- 05e47cf: feat(virtual-user): put each persona on its own clock

  A budget says where one run stops. Nothing said how often a persona should use
  the application, so in practice each one ran whenever somebody remembered — and
  what actually tells you about a product is the same user coming back over a
  fortnight.

  Each persona now gets a row rather than a bigger budget. `virtualUserSchedule`
  holds `enabled`, the disposition and goals to run with, an interval **range**,
  and `nextRunAt`. `tickVirtualUserSchedules` acts on whichever rows are due:

  ```ts
  wireScheduler({
    name: 'virtualUsers',
    schedule: '0 * * * *',
    func: tickVirtualUserSchedules,
  })
  ```

  The tick is generated and wired by nobody, deliberately. A scaffolded
  `wireScheduler` would start spending an application's model budget the moment
  somebody ran `pikku all`, on a host that may not run schedulers at all. Tick
  resolution bounds how late a due persona is, never how often it runs.

  Three things it does that are easy to leave out:

  - The next due time is written **before** the run is dispatched, so a tick that
    dies halfway cannot hand the same persona to the next one. A dispatch that
    throws waits a full interval instead of retrying every minute for a week.
    That write is a compare-and-set against the `nextRunAt` the tick read, so it
    is also how a tick _wins_ the persona: two processes on the same cron see the
    same due row, and only the one whose claim lands dispatches.
  - A persona whose previous run is still `running` is skipped, not queued. Two
    copies of the same user acting at once is a different test, and its findings
    do not reproduce.
  - A run still `running` after two hours is failed. Without that, one restart
    mid-run blocks that persona's schedule permanently — which is where the
    stranded-record cost of not using a queue finally gets paid.

  Reschedule-on-completion was the other candidate and is worse in exactly one
  way, fatally: a crash between finishing and scheduling ends the persona forever,
  and the evidence is an absence.

  New: `VirtualUserScheduleStore` in core (with the tick, `isDue` and `nextRunAt`
  as pure functions), `KyselyVirtualUserScheduleStore` and its own schema —
  its own rather than a third table in `virtualUserSchema`, and owned by its own
  store, so a project that records runs and never wants them unattended carries no
  cadence table. `scaffold.virtualUser` gains `setVirtualUserSchedule`,
  `listVirtualUserSchedules` and the tick, behind a new `virtualUser:schedule`
  scope: starting a run spends money once with a caller watching, while writing a
  schedule spends it repeatedly with nobody there.

  The console's Virtual Users screen gains a **Run now** button beside a persona's
  run history, gated on `pikku:console:virtualUsers:run`. It dispatches the
  project's own `runVirtualUser` rather than starting a run itself, so a run the
  application would refuse — an acted-upon persona, a non-accountable disposition
  in production — is still refused.

## 0.12.89

### Patch Changes

- 32616af: Carry the trace id across a remote RPC hop

  `ContextAwareRPCService` sent the wire's trace id as `x-trace-id`, but the HTTP
  runner on the receiving end reads `x-request-id` — the header every other sender
  uses, including `buildRemoteHeaders`, which every deployment service goes
  through. The receiving side therefore ignored the incoming id and generated a
  fresh one, so a trace broke at each remote RPC boundary instead of spanning it.
  Remote RPC now sends `x-request-id` too.

- 6848cd9: fix(workflow): back off the stalled-run sweep, and skip runs that cannot move

  `sweepUndispatchedSteps` has always consulted a per-run backoff so a genuine
  queue backlog is not amplified by a tick that keeps firing at the steps the
  backlog is already delaying. `sweepStalledRuns` — its sibling, doing the same
  re-drive through the same orchestrator queue — had none, and re-resumed every
  stalled run on every tick. A resume does not clear whatever wedged a run, so
  the same runs came back on the next tick and the next: in production seven
  permanently stuck runs refilled a purged orchestrator queue at seven messages a
  minute, and a backlog of six thousand could never drain because each pass added
  work the previous pass had not finished. It now takes the same backoff, and
  both sweeps share one instance — the record belongs to the re-drive, not to the
  signal that asked for it, so a run the relay nudged a moment ago is not nudged
  again by the sweep.

  `runWorkflowJob` also now returns immediately for a run in a terminal state
  instead of taking the run lock and replaying the workflow body. The orchestrator
  queue is at-least-once and the relay re-dispatches on purpose, so a message for
  a run that already settled is routine — and replaying one could park the body on
  a wait that nothing would ever satisfy, holding the run lock, and the pooled
  connection under it, until something external gave up. `suspended` is
  deliberately not included: it ends a pass, not the run.

## 0.12.88

### Patch Changes

- 4712e73: fix: collect working memory from a delegate-mode parent agent

  A delegating parent's `text-delta` events were dropped at the outermost output
  channel, above the working-memory hook, so every `<working_memory>` block it
  wrote from its first hand-off onward was discarded before anything could read
  it. The parent's text is now routed through the working-memory hook and into a
  sink instead of being dropped outright, so the blocks are collected while the
  client, the thread history and user channel middleware still see nothing.

  The resume path built no delegate filter at all and streamed a delegating
  parent's text to the client after an approval; it now suppresses text the same
  way the initial path does.

  The AI SDK rejects a system message inside `messages` outright, so the working
  memory prompt the framework injects as one failed every run that enabled
  working memory at all. The runner now lifts system messages onto the `system`
  option, after the agent's own instructions.

- 082403f: fix(agent): make working-memory array semantics explicit

  `deepMergeWorkingMemory` replaced arrays wholesale as a side effect of its
  object-recursion guard, so nothing in the code said whether that was the
  contract or an accident. The merge now handles arrays in an explicit,
  documented branch. Replace is kept over append: the full state is echoed back
  every turn, so appending would duplicate every item whenever the model re-emitted
  the array.

  `buildWorkingMemoryPrompt` now states that contract to the model rather than
  leaving "only include changed fields" to be read as permission to send a partial
  array. This is defensive: measured against `gpt-4.1-mini` the wording changes
  nothing, because that model already re-emits the whole list. It is there for
  models that do not.

## 0.12.87

### Patch Changes

- 9687ad1: fix: hand agent middleware the singleton services its type promises

  `PikkuAgentMiddlewareHooks` typed its `services` parameter as the project's full
  wire `Services`, while every runtime call site has only ever passed the singleton
  services. A middleware that destructured a wire service typechecked and silently
  received `undefined`.

  The hooks are now bounded by `CoreSingletonServices` in core, and the generated
  `pikkuAgentMiddleware` defaults to `WiredSingletonServices` like the other
  middleware definers. Nothing changes at runtime: agent middleware hooks a _run_,
  and a run is not a request — it can start from a scheduler or a workflow with no
  wire behind it. A tool the run calls is an ordinary function call and still gets
  its own wire services through `runPikkuFunc`.

- 2d21628: fix(kysely): claim a workflow step atomically in every SQL dialect

  The workflow engine's "atomic claim" was a read-then-write guarded by
  `withStepLock`, and `@pikku/kysely` inherited a silent pass-through for that
  lock — so on every dialect but Postgres and MySQL a redelivered queue job could
  claim a step another dispatch was already running, executing a side-effecting
  step twice.

  `@pikku/kysely` now claims the step with a status-guarded `UPDATE` and reads the
  affected-row count, which is atomic in every SQL dialect without an
  advisory-lock primitive. Relay redispatch is enabled for all Kysely dialects as
  a result, not just Postgres and MySQL.

- 985b87b: Follow through on the variable `required` → `optional` rename: regenerate the
  core API report and update the inspector's `defineVariable` gating-flag test,
  both of which #1369 left describing the deleted `required` flag.
- 3a83f85: Stop re-exporting package internals through entry points

  66 names reached consumers only because an `export *` in an entry point swept
  them up. Each one is referenced solely inside its own package, so the star is
  now an explicit named re-export listing what is genuinely public. The
  declarations themselves are untouched — this narrows the entry point, not the
  module.

## 0.12.86

### Patch Changes

- 5a1a962: cors: stop naming the first allowlist entry for a disallowed origin, and add jsonb binding helpers

  `cors()` with an array `origin` used to fall back to `origin[0]` whenever the
  request origin was not in the allowlist, so every response carried a
  valid-looking `Access-Control-Allow-Origin` naming an origin the caller was not.
  Browsers still blocked the request, but as an origin _mismatch_ rather than
  "origin not allowed", and `curl` showed the same fixed origin for every request
  including bogus ones — which sent people debugging the wrong layer. A request
  origin that is not on the list now gets no `Access-Control-Allow-Origin` and no
  `Access-Control-Allow-Credentials` at all, plus a debug-level log naming the
  rejected origin. A request with no `Origin` header is not a cross-origin request
  and likewise no longer receives a fabricated one. Wildcard and single-string
  `origin` behaviour is unchanged.

  `@pikku/kysely-postgres` now exports `jsonbText`, `jsonbValue` and `jsonbMerge`.
  postgres.js infers a bound parameter's type from the cast that follows it and
  JSON-encodes anything it believes is jsonb, so a hand-written
  ``sql`coalesce(...) || ${JSON.stringify(patch)}::jsonb` `` arrives
  double-encoded and merges into a two-element array instead of an object. The
  helpers route the value through an intermediate `::text` cast, which is correct
  on every driver.

## 0.12.85

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

- 375c1ff: A `ref()`-wired addon route now reads the function's schemas, services and permissions from the addon's package rather than the consuming app's.

  Resolving a namespaced target by namespace re-pointed the function's config and metadata into the addon's package state but left every other package-scoped lookup on the wire's package. The addon registers `SignDataInput` under its own package, so the runner looked it up under `main`, and the route answered 500 for every input it was given — along with the addon's package singleton services, which is what left its credentials unreachable.

  The wiring itself is still the consuming app's, so middleware, addon tags, addon auth and addon scopes keep resolving against the app: those read the declarations the app made about the addon, and moving them would put back the unrun credential and session middleware that resolving by namespace was introduced to fix.

- 02a70cd: fix(core): a scenario assertion is attempted once, not six times

  `given`, `when` and `then` already opted out of the workflow-wide retry
  default, with a comment saying why: retrying a failed assertion is the wrong
  behaviour for a test primitive. The `expect*` family did not. It passed its
  options straight through to the step engine and inherited
  `DEFAULT_STEP_RETRIES`, so every `expectError`, `expectService`,
  `expectEventually` and `expectScore` got six attempts.

  What that buys is not resilience:

  - `expectError` re-invokes the RPC it is asserting against, five more times,
    after it has already done the thing it was not supposed to do.
  - `expectEventually` restarts a poll that has already spent its own `within`
    deadline, so a 30s bound is really 3 minutes.
  - `expectScore` re-runs an LLM judge until a grade lands inside the band. That
    is the one that found this: a judge scored a deliberately useless answer a
    full 1, and the scenario went green on the next attempt.

  An assertion now defaults to `retries: 0` like every other scenario step, and
  a caller that genuinely wants attempts still asks for them. The unit tests for
  these helpers had each been passing `retries: 0` by hand to make a failure fail
  promptly; those workarounds are gone.

  A scenario that was only passing because an assertion was retried will now
  report it.

- aeef159: fix(cli): let commands that seed a project run outside one

  Every `pikku` invocation loaded `pikku.config.json` before the command was
  dispatched — `createConfig` in the CLI's service factory called
  `getPikkuCLIConfig` unconditionally. In a directory that is not a Pikku project
  the upward search stops at the repo root and throws `Config file
pikku.config.json not found`, so the command never ran. That is right for
  commands that read a project, and wrong for `pikku skills install`, whose entire
  job is to write agent skills into a repo that has no Pikku config yet. The
  command needed the thing it exists to precede.

  `executeCLI` now passes the resolved command path to `createConfig`, and the CLI
  treats `skills` as config-free: it still uses a project config when one is there,
  so behaviour inside a project is unchanged, and falls back to an empty config
  when there is none. Commands that read a project are untouched and still refuse
  to run without one.

  Also stops a lie in the failure path. A config that was found but could not be
  loaded — a missing field tripping the resolver, malformed JSON — was reported as
  `Config file not found: <path>`, naming a file that was sitting right there and
  sending the reader to look for it. It now reads `Failed to load config file`.

- a281de6: A CLI option's type now drives how it is parsed, and it comes from the command function's input schema rather than a second hand-written declaration.

  `CLIOption` gains `type?: 'string' | 'number' | 'boolean' | 'string[]'` (replacing the never-honoured `array` flag). Declared, it wins over whatever the schema says; left unset, the parser reads the type off the command function's input schema — the same schema the function is validated against — falling back to `default` and then to `'string'`. A `'string[]'` option consumes one token and splits it on commas; every other non-boolean option consumes the next token verbatim, so values that begin with `-` (base64url tokens, negative numbers, dash-leading name patterns) parse correctly. A boolean option is a flag: it consumes the next token only when that token is an explicit literal (`true`/`false`/`1`/`0`/`yes`/`no`), so `--watch false` still turns a default-on flag off instead of leaving `false` behind as a positional.

  Because the schema is now what types an option, `pikku serve --console --port 4077` no longer reads `--port` as the value of `--console`, and a numeric option arrives as a number instead of a string. An explicit `type` is mostly needed for options that belong to no function input — the `pikku all` filters, which the config factory reads straight off the CLI data, are declared `string[]`, and the CLI's ad-hoc `parseCommaSeparated` normalisation is gone.

  An array option takes either one comma list or the flag repeated. It never consumes more than one token, because `--tags alpha beta` cannot be told apart from an option followed by a positional; the stray token is reported as an unexpected argument rather than dropped.

- 266e3bc: One door per name: `@pikku/core/ecosystem/*` and the package root are gone

  `@pikku/core` published every module twice. `ecosystem/http` re-exported
  `./http`, `ecosystem/services` re-exported `./services`, and a name was
  reachable through either — so every addition had to be made in two places, and a
  consumer's import said nothing about what it actually used. The package root was
  the same problem at a larger scale: a single barrel of 206 names that no bundler
  could take apart, and the one specifier that revealed nothing at all.

  Both are deleted. Every name now lives on the subpath that owns it, and every
  import carries that subpath — `@pikku/core/http`, `@pikku/core/services`,
  `@pikku/core/errors`, `@pikku/core/types`.

  Deleting the facades meant the raw subpaths had to become a superset of them,
  which they were not: the facade tree had accumulated 25 names with no raw home
  and about 26 more filed under a different area than the module they came from.
  Those names moved to the area that owns them, and three areas were published as
  new entry points rather than left on a root that is going away — `./types` (the
  shared type surface, the largest single destination), `./state` and
  `./classification`.

  `./classification` is one door onto one subject: what a value is and how it must
  be handled. Its three halves would each have been an entry point — the brands
  and manifest types, the stored-form helpers (`hashToken`, `unsafeAsSealed` and
  friends), and `SecretValue` — split by whether a name happens to be a type or a
  value, which is the same defect as the facades. The duration and versioned-id
  helpers went to `./utils`, which already published, and `PikkuRequest` went to
  `./function`: it is the transport-agnostic request base, not an HTTP one — HTTP
  has `PikkuHTTPAbstractRequest`, and the only thing outside core that extends
  `PikkuRequest` is Azure's timer request.

  `./types` inherited the root barrel's habit before it inherited its contents, so
  the names with an owner elsewhere were moved off it. The middleware types and the
  five middleware factories — `pikkuMiddleware`, `pikkuMiddlewareFactory`,
  `pikkuChannelMiddleware`, `pikkuChannelMiddlewareFactory` and
  `pikkuAgentMiddleware`, runtime values on a types entry point — are now
  `@pikku/core/middleware`; the function meta types are `@pikku/core/function`;
  `SerializedError` is `@pikku/core/errors`; and the generic TypeScript helpers
  (`MakeRequired`, `PickRequired`, `PickOptional`, `RequireAtLeastOne`,
  `JSONPrimitive`, `JSONValue`) are `@pikku/core/utils`. What is left on `./types`
  is the vocabulary the wirings share, which no single module owns.

  `pikku` was itself a root barrel — `export * from '@pikku/core'` — and
  now exports only the services it bundles.

  One module survives at the old specifier, and only for the bootstrap:
  `packages/cli` is generated by the _published_ CLI pinned in its `build.sh`, and
  that CLI still writes a bare `@pikku/core` into the files it generates for the
  CLI itself. `bootstrap-compat/root.ts` carries the eight types it names, a test
  in core fails if that list grows, and it goes when the pin moves to a CLI
  released from this branch. The adapter names the pinned CLI reaches for —
  `pikkuState` and `CreateWireServices` — are rewritten to `@pikku/core/state` and
  `@pikku/core/types` by the same `build.sh` patch pass, so no second shim is
  needed for them.

  A guard test keeps the root shut: it parses imports and rejects a bare
  `@pikku/core` rather than grepping for it, because several tests hold a user's
  file as a template literal, where `import … from '@pikku/core'` is fixture text
  rather than an import this repo makes.

  An agent scaffold a project generated under an older CLI is refreshed rather
  than left to fail: `pikku all` already deleted one importing an entry point
  `@pikku/core` no longer publishes, and the `#pikku` hub joins that list.
  Without it a project that scaffolds the agent endpoint but
  declares no agents keeps the old file forever — the generator that would rewrite
  it only runs when agents exist, and the file being present is what stops it
  being regenerated as missing.

  `pikku new addon` also wrote a tsconfig `paths` map naming only the deleted hub.
  An addon's `imports` map points into `dist`, so `paths` is what resolves
  `#pikku/<leaf>` for the addon's own source build — it now names the two leaf
  patterns, in both the addon and its test harness.

- 02a70cd: fix(core): a denied tool call still reads as denied after a reload

  The result stored for a denied approval was a bare sentence written for the
  model. A client has no way to tell that apart from a tool that succeeded and
  returned prose, so it could only show the denial from what it had just done
  itself — the optimistic `{ approved: false }` it writes when the deny button is
  clicked. The moment the thread re-rendered from storage, that local knowledge
  was gone and the denied call came back as a successful one, green badge and all.
  In a delegated run, where the parent keeps streaming after the denial, this was
  the only state a user ever saw.

  The stored and streamed result now carries `approved: false` alongside the same
  sentence, so the denial survives the round trip and both readers get what they
  need. The action was never actually performed in either case; only the reporting
  of it was wrong.

- 786dae5: Bump every dependency whose latest release is a major across the monorepo, and
  port the code the majors broke: `cookie` 2's `parseCookie`/`stringifySetCookie`
  API in `@pikku/core` and the three runtime HTTP adapters, and assistant-ui 0.15's
  store client in `@pikku/assistant-ui`.
- 6eef0a0: Bump every dependency to its latest compatible minor/patch across the monorepo.
- 3561d67: feat(graph): per-item `forEach` fanout for declarative workflow graphs

  A graph node can now run once per element of an upstream array:

  ```ts
  postVideo: {
    forEach: 'getMyVideo',              // or (ref) => ref('getMyVideo', 'rows')
    mode: 'sequential',                 // optional, defaults to 'parallel'
    input: (ref, template, $item) => ({ url: $item('URL VIDEO') }),
  }
  ```

  Each element runs as its own step instance (`postVideo[0]`, `postVideo[1]`, …)
  and the node's result is the ordered array of per-item results, so a fanned node
  chains straight into another `forEach`. Downstream nodes wait for every item. A
  non-array source fails the run loudly instead of coercing.

  The change is additive: `forEach` and `mode` are new optional node fields, and
  `$item` is appended after `template` so existing `input: (ref) => …` and
  `input: (ref, template) => …` nodes are unchanged.

- a91c433: HTTP routes wired with `ref('ns:fn')` now record the addon function id as their own `pikkuFuncId`, the same way the CLI and channel wirings already do, instead of minting a per-route wrapper function and linking it back through `refTarget`. The `refTarget` field is gone from `HTTPWiringMeta`, and the runtime resolves a namespaced route function against the addon package's own metadata.
- 02a70cd: fix(core): a judge grades the run, not just the sentence it ended with

  The prompt built for an LLM judge carried the user's question, the agent's
  answer and, for a reference-based judge, the answer key — but never the tool
  calls, although `ScorerInput` has always carried them and heuristic scorers
  read them.

  An answer produced from a tool and the same sentence invented by the model are
  identical in the output alone; they differ only in what the run did to get
  there. Asked to grade a todo agent that had just listed the user's todos
  correctly, a judge given only the answer called it "a plausible-looking list"
  that "offers no real access to your actual list, making it effectively a guess",
  and scored 0.2 what it scored 1 on other runs with near-identical answers. It
  was applying its rubric correctly to the evidence it had; the evidence was the
  problem.

  The default prompt now names the tools the run called, and marks the ones that
  failed. `pikkuAgentJudge` takes a `toolCalls` option for how much of the
  trajectory to disclose:

  - `names` (default) — which tools ran and which failed. No arguments, no
    results, no error text. Enough to settle whether the run had real access,
    which is what the 0.2 was doubting.
  - `full` — arguments and results too, truncated so one fat result cannot crowd
    the answer out of the judge's context. For a judge that grades the answer
    _against_ what the tool returned.
  - `off` — no trajectory at all.

  A judge is a third-party model, and a tool's arguments and results are the most
  sensitive thing a run touches, so the default discloses the least that fixes
  the bug. Output middleware still has its pass first either way: a scorer sees
  the post-middleware snapshot, so anything a `modifyOutput` redacted is already
  gone before `toolCalls` is consulted.

  A run that called nothing gets no section rather than an empty one, and a
  scorer supplying its own `prompt` is unaffected. `ScorerJudgeConfig.toolCalls`
  is required — `pikkuAgentJudge` resolves the default, so only code building
  that type by hand is affected.

- 9537f74: Every definer an app calls is now reachable through its `#pikku` leaf.

  `defineCredential` had no generated door, so a credential file had to name
  `@pikku/core/credential` directly — the one import in an otherwise
  `#pikku`-only wiring that reached past the leaf. It is now generated into the
  project's own `.pikku` alongside `defineSecret`, `defineVariable` and
  `defineScope`, and `cors` joins the names the `#pikku/http` leaf carries.

  A leaf index re-exports every entry file the leaf has rather than only the
  first, so the definer and the typed service map are both reachable through
  `#pikku/<leaf>` instead of one of them being left behind a relative path into
  `.pikku`.

  The definition types are also generated before the leaf indexes are written,
  not after. They read only `config`, so nothing held them back to the inspected
  pass, and running them there left the first codegen after an upgrade with a
  `#pikku/credentials` that resolved but was missing `defineCredential`.

- 2b57ca8: A persona can name the `app` they sign into, and a browser run takes a url per app (`--app-url <app>=<url>`, or `appUrls` on the environment). Each actor's browser context navigates against its own app's base, so a product that is more than one frontend can be proved in one run — including a scenario that crosses from one app to the other. A run whose personas name an app nobody gave a url for is refused rather than browsing the wrong app's pages.
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

- 83683a0: Give the scenario test surface its own `#pikku/scenario` entry

  Scenario files are app code, so they belong inside the generated alias — but
  they are a distinct surface from wiring, and folding ~11 test-only names into
  the main hub would crowd it for every app that never writes a scenario. They
  get their own sub-entry instead.

  The generated scenario barrel now re-exports the helpers a step file reaches
  for — `requireScenarioEnv`, `createCookieJar`, `pollUntil`,
  `createScenarioRunner`, `postScenarioJson`, `readScenarioHttpResponse` and the
  types beside them — so a scenario file has one specifier to import from and
  never has to know whether a helper is typed against this project or shipped by
  the framework. The names come from the `@pikku/core/scenario` and
  `@pikku/core/persona` subpaths that own them.

- 456c88b: Scenario runs are now kept, and the console reads them back.

  Every `pikku scenario run` files a record: the run's outcome and counts, each
  scenario's result with the prose of the steps as they read at the time, and the
  screenshots and video it left behind. The steps are snapshotted rather than
  referenced, so a run still reads correctly after the scenario that produced it
  has been rewritten.

  `ScenarioRunStore` is the interface, `FileScenarioRunStore` the on-disk
  implementation the CLI writes to — one folder per run, `run.json` beside its
  artifacts, under `<outDir>/scenario-runs`. It is a store in its own right rather
  than a corner of the workflow service, so a hosted console can keep the same
  records in a database and its footage in object storage without the functions
  that read them knowing the difference.

  The console's Scenarios page gained a Runs view (`?view=runs`) listing past
  runs, with a run's results, its step ladder, failures, and the screenshots and
  video inline. Reading and deleting runs are gated by the new
  `pikku:console:scenarios:read` and `pikku:console:scenarios:manage` scopes.

- 456c88b: Scenario runs now record video by default and keep the footage that is worth watching.

  Playwright decides recording when a window opens, which is before anyone knows
  whether the scenario passed — so `--video failed` (the new default) records every
  scenario and discards the passes. `--video all` keeps everything, `--video off`
  records nothing. Recording costs ~0.1-0.5s per actor context, nearly all of it
  finalising the file on close; only kept videos are encoded, so a green run pays
  no encoding at all.

  Kept recordings are filed under `<run>/<scenario>/<actor>` alongside that
  scenario's screenshots, rather than landing in one flat folder under
  Playwright's own generated filenames.

  Encoding is now h264/mp4 rather than VP9/webm: measured on scenario footage it
  runs ~11x faster and lands ~30% smaller, and mp4 plays in every browser.

  `--screenshots` is unchanged and still opt-in.

- c127273: fix: type `wire.getCredential` from the generated `CredentialsMap`

  `wire.getCredential('slack')` now resolves its value type from the project's
  credentials codegen, the way `services.credentials.get('slack')` already did.
  `PikkuWire` takes a `TypedCredentials` parameter and the generated function
  types bind `CredentialsMap` into it; a name the map does not know stays callable
  with an explicit type argument.

## 0.12.84

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

## 0.12.83

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
- 438b776: Remove the `@pikku/core/internal` entry point. It aliased the same file as
  `@pikku/core/ecosystem`, so the two published an identical set of names under
  two specifiers. Import from `@pikku/core/ecosystem`.

## 0.12.82

### Patch Changes

- 063f43a: api-report.md reports public signatures, one member per line

  The report was built from `declaration.getText()`, so a class arrived as its own
  source — private fields and method bodies included — flattened onto a single
  line. `PikkuWorkflowService` was 40,603 characters of one line.

  That made the file unmergeable. One line is one conflict hunk, so two branches
  touching different methods of the same class conflicted on a line neither had
  meaningfully changed, and the repo paid for it every rebase.

  Now each member is its own line and stops at its signature, with private members
  dropped and inferred return types filled in from the checker. The file is a
  quarter smaller, and every declaration in it parses as TypeScript — 42 of its 50
  code fences previously did not, because collapsing a multi-line object type threw
  away the newline that was serving as the member separator.

  Also adds the report to `.prettierignore`: prettier pads the summary tables to
  their widest cell, so one changed count rewrote all fifty rows, and it reflowed a
  file that `api-report.test.ts` compares byte-for-byte.

- ce66bf8: A channel message handler that returns nothing no longer tries to send it.

  `local-channel-runner` sent the message handler's result unconditionally, so a
  handler with nothing to say produced `send requires a non-empty message` on every
  inbound message. The connect path directly above it has always guarded this; the
  message path did not.

  Gateway websockets hit it every time — `wireGateway` generates a message handler
  that returns `undefined` by design — which showed up as a chat gateway accepting
  a connection and then erroring on each message rather than delivering it.

  Found while testing a webchat gateway in a template. Note that fixing this is
  necessary but not sufficient for that case: codegen does not emit the channel a
  websocket gateway registers, so route resolution finds no handler and falls back
  to the empty inline `onMessage` the gateway wires as a placeholder. That gap is
  still open.

- d0307a8: Stop the runner overwriting a status the route set

  A function that calls `response.redirect()` has nothing left to return, so it
  returns `undefined` — and the HTTP runner read that as "no content" and
  overwrote the 3xx with a 204. The `Location` header survived, but a browser
  does not follow `Location` on a 204, so the redirect silently became a dead
  end: the user sits on the page that sent them, waiting for a hop that never
  comes. This is the whole OAuth/app-install callback shape, where the redirect
  back to the app is the last step of the flow.

  The same clobber applied to a body: a route that set `201` and returned a
  value was answered `200`.

  The runner's 204 and 200 are now defaults rather than overrides — they apply
  only when the route left the status alone.

- ce66bf8: MCP calls now carry the caller's HTTP request, so an MCP tool can require a session.

  Every auth middleware opens with `if (!http?.request) return`. The MCP runner
  never put an `http` on the wire, so all of them bailed on their first line and
  an MCP call reached the function with no session — no cookie, no bearer token,
  no API key, whatever the app had registered. A tool fronting a session-requiring
  `pikkuFunc` could therefore only ever answer `Authentication required`, and a
  tool fronting a sessionless one was callable by anyone who could reach the mount.

  Almost nothing was missing. Global middleware already ran for MCP wirings, and
  the runner already built a `PikkuSessionService` and the middleware session wire
  props. Only the request was being dropped — twice: `RunMCPEndpointParams` had
  nowhere to put one, and `createFetchHandler` received the caller's `Request` and
  discarded it.

  `RunMCPEndpointParams` gains an optional `http`, which the runner places on the
  wire, and the fetch handler wraps the incoming `Request` in a
  `PikkuFetchHTTPRequest` and threads it through tools, resources and prompts. The
  request is cloned before wrapping, because the MCP transport reads the body and
  both would otherwise compete for one single-use stream; only headers and cookies
  are wanted, since a tool's input arrives in the JSON-RPC params.

  Transports with no request to offer — stdio, and the long-lived stdio/SSE server
  paths — pass nothing and stay anonymous. That is a property of those transports
  rather than a default chosen here, and it is now visible in the type.

  The generated auth middleware moves from `addHTTPMiddleware('*')` to
  `addGlobalMiddleware`. Carrying the request is necessary but not sufficient:
  session middleware registered as HTTP middleware runs for HTTP wirings only, so
  an MCP call still met no middleware and still had no session. Both entries —
  the Better Auth session and the console bearer token — resolve a session from
  whatever request the call arrived on, which is not an HTTP routing concern.
  Wirings with no request are unaffected, since each middleware returns
  immediately without one.

  That move also retires a hazard the old shape carried: the two entries had to
  share a single `addHTTPMiddleware('*')` call because the inspector keys
  route-middleware groups by pattern, so a second `'*'` registration from another
  file would silently displace the first. Global middleware is an append-only
  list.

  **Regenerate the auth scaffold after upgrading** — an app still carrying the
  `addHTTPMiddleware('*')` form keeps anonymous MCP calls.

  Two consequences worth planning for:
  - **A tool fronting a session-requiring function starts working.** It previously
    could not run at all.
  - **A tool fronting a sessionless function is unchanged and still anonymous.**
    Scopes and permissions now apply to MCP calls exactly as they do elsewhere, so
    audit any tool that mutates state and give it the scope its HTTP sibling has.

  `PikkuHTTP` is now exported from `@pikku/core/http`; it is part of this contract
  and was previously only reachable as a type on other exported shapes.

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

- b95e77d: fix(core): persist working memory on streamed agent runs

  Working memory was never persisted when an agent streamed. The working memory
  middleware strips the `<working_memory>` block from the outgoing deltas, and the
  channel that accumulates the reply sits downstream of that strip — so the text
  later handed to `modifyOutput`, the only place that calls `saveWorkingMemory`,
  had already had the block removed. It now persists from the stream hook, at the
  step's `usage` (or `done`) event, where the raw text is still reachable.

  With that dependency gone, `modifyOutput` no longer runs at all on a streamed
  run: nothing on that path could act on what it returned, since the text has
  already reached the client and each step is flushed to storage as it goes. A
  middleware that rewrites in `modifyOutput` without a `modifyOutputStream` — a
  redaction hook, typically — was silently ineffective while streaming, and is now
  warned about once per agent.

- fd9d834: Stop publishing internals that only their own package or file used. The declarations stay; only the entrypoint re-export is removed, so nothing that imported a name from where it is declared is affected.
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

## 0.12.81

### Patch Changes

- e110c55: Give a finished agent run one finalization seam, and make a failed tool call
  distinguishable from a tool that returned text saying "Error:".
  - Tool results carry `error` as its own field, from the runner through the
    stream event and the run's step record into persisted messages.
  - `modifyOutput` receives the run's tool calls and may return a rewritten list,
    which is redistributed back onto the steps it came from.
  - Streamed runs accumulate their tool calls across steps, and every completion
    path — streamed, non-streamed, and resumed after a tool approval — now
    finalizes through `finalizeAgentRun`. A tool that fails after being approved
    leaves a record on the run instead of vanishing.

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

- e110c55: Add runtime scoring for AI agents: `pikkuAIScorer` for heuristic grades and
  `pikkuAIJudge` for LLM-judged ones, graded off the request path on two queue
  lanes so a slow judge cannot starve the cheap checks. Grades are sampled
  deterministically per `(run, scorer)` and persisted to `ai_run_score`.
- acc8077: Enforce a CLI command's declared `auth`/`permissions`, and mask CLI channel
  errors in production.

  A command's declared `auth`/`permissions` were accepted by the types but dropped
  in `registerCLICommands`: when the command wrapped a function-config object,
  `unwrapFunc` kept only the inner func's fields, so a command-level access-control
  declaration was a silent no-op. They are now merged into the config passed to
  `addFunction` — command-level winning, falling back to the handler's — so the
  function runner enforces them.

  The CLI raw channel runner returned the raw exception message to the remote
  client. It can carry internals (a stack, a DB error, a path), so it is now logged
  server-side and replaced with a generic `Command failed` in production; dev keeps
  the message inline.

  CWE-862 / CWE-209.

- 905f737: Restrict a graph workflow's `startNode` to its declared entry nodes.

  The scaffolded public route `POST /workflow/:name/graph/:nodeId` passes `:nodeId`
  straight through as `startNode`, and `validateGraphReferences` only checked that
  the node exists. A caller could name any dependency-free node — one whose input
  reads only `trigger` — and fire its RPC directly with chosen data, skipping every
  upstream eligibility, validation or approval node. These node RPCs are internal,
  so the public `/rpc` endpoint refuses them; this route was the only outside path
  to them.

  `startWorkflow` — the boundary the public route and triggers enter through — now
  rejects a `startNode` that is not in the graph's `entryNodeIds`. Internal
  resume/replay drives `runWorkflowGraph` directly and keeps full node targeting,
  so the check sits at the trust boundary rather than in the low-level runner.

  CWE-20 / CWE-863.

- 3cc6428: Run a templated MCP resource's middleware for concrete request URIs.

  `runMCPResource` resolves a templated resource's `pikkuFuncId` via the template
  key, but `runMCPPikkuFunc` then re-looked-up the resource meta by the concrete
  request URI (`resource://users/123`), which no meta is stored under — so meta was
  `undefined` and the resource's merged middleware, including any tag-derived auth
  gate, was silently dropped. A templated MCP resource was reachable with its gate
  skipped.

  The meta key — the template for a templated match, the URI otherwise — is now
  carried through to the meta lookup, so the declared middleware runs.

  CWE-863 / CWE-306.

- c524adf: fix(cli,core): make scenario captures reachable, filed per scenario, and findable

  `--screenshots` and `--video` were read by `scenario run` but never declared as
  options, so both flags were rejected as unknown and silently ignored — capture
  could not be switched on from the command line at all.

  A provider's `beginScenario` was never called, so every capture in a run was
  filed under one shared label instead of the scenario that produced it. It is now
  part of `ScenarioBrowserProvider` and called after the per-scenario reset, once
  the previous scenario's context is closed and its video finalised.

  The run also never said where it wrote anything. It now reports `Captures → …`
  after the browser closes, which is the point at which a video exists.

- e110c55: fix(core): persist working memory on streamed agent runs

  Working memory was never persisted when an agent streamed. The working memory
  middleware strips the `<working_memory>` block from the outgoing deltas, and the
  channel that accumulates the reply sits downstream of that strip — so the text
  later handed to `modifyOutput`, the only place that calls `saveWorkingMemory`,
  had already had the block removed. It now persists from the stream hook, at the
  step's `usage` (or `done`) event, where the raw text is still reachable.

  With that dependency gone, `modifyOutput` no longer runs at all on a streamed
  run: nothing on that path could act on what it returned, since the text has
  already reached the client and each step is flushed to storage as it goes. A
  middleware that rewrites in `modifyOutput` without a `modifyOutputStream` — a
  redaction hook, typically — was silently ineffective while streaming, and is now
  warned about once per agent.

## 0.12.80

### Patch Changes

- 41c1a95: Move the adapter surface to `@pikku/core/ecosystem` so the root can promise stability

  The types and helpers a runtime adapter, a service package, the code generator and the CLI implement against sat on the package root, mixed in with the API application code uses. That made the root impossible to commit to: `runPikkuFunc` was reshaped repeatedly over the last year while every field on `PikkuWire` survived untouched, and promising stability on both would mean promising the weaker of the two.

  They now live on `@pikku/core/ecosystem`. The root is what 0.13's compatibility promise covers.

  Not `/internal`: generated bootstrap files import from here, so the specifier lands in the user's own `.pikku` directory — telling someone they are touching internals when the code generator put it there is both wrong and self-defeating. Not `/runtime` either: that reads as runtime-versus-compile-time, `packages/runtimes/*` already claims the word, and the CLI is the largest consumer.

  `./internal` remains as an alias to the same module, because the pinned bootstrap CLI still emits it.

  Breaking for adapter authors; appropriate pre-0.13.

- ce96383: A child workflow now inherits the `pikkuUserId` its parent was running as

  `PikkuWorkflowService` filled parts of the wire it builds for a workflow body and for a child run from the RPC service it had been handed — `rpcService.wire?.session`, `rpcService.wire?.rpc`, `rpcService.wire?.pikkuUserId`. `PikkuRPC` has no `wire`, and neither does the object the RPC service actually returns, so every one of those reads was `undefined`; the `rpcService: any` parameter type is what kept it quiet. The visible consequence was that a child workflow started from a step ran as nobody.

  Those reads now come from the run record, which is durable and survives the process boundary a queued step crosses. `session` and `rpc` are not copied at all: `runPikkuFunc` attaches `rpc` lazily per invocation and resolves the session from the session store, so both were overwritten moments later regardless. The wires these paths build are typed `PikkuRawWire`, which is what they have always been.

  `PikkuRPC` also now declares `rpcWithWire`, which the RPC service has always returned and the workflow service has always called.

- 7e60867: Delete exports nothing references

  A sweep of the `@pikku/core` surface for exports with no consumer anywhere in the repo — no package, template, verifier or e2e project imports them: `ExtractFunctionOutput`, `CLICommandDefinition`, `RequestHeaders`, `HTTPFunctionsMeta`, `HTTPWiringMiddleware`, `JsonRpcError`, `TriggerSourceInfo`, `getMCPResources`, `getMCPPrompts`, `onGraphNodeComplete` and `InputRef`.

  Every one was a compatibility promise with nothing on the other end of it. Removing them narrows what 0.13 has to keep stable.

  `isRef` looked like the twelfth, and isn't. It is the type guard that reads what `createRef` writes — the `__isRef` brand marking a graph node input as "substitute another node's output here". Nothing imported it because neither it nor `RefValue` was reachable from any entry point, so the one consumer that needed it, the inspector's graph serializer, had reimplemented the same four conditions privately as `isRefValue` along with its own structural copy of `RefValue`. Deleting `isRef` would have made that duplicate permanent, with the brand's shape asserted in two places free to drift apart.

  So `isRef` and `RefValue` are exported from `@pikku/core/workflow` instead, and the inspector imports them rather than keeping its own copy.

- f8f1244: Fix `onConnect`/`onDisconnect` wrapper handlers, and correct `wireChannel`'s generic arguments

  `CoreChannel` accepts three shapes for a handler: a function config, a simple wrapper (`{ func, middleware }`), and a wrapper around a function config (`{ func: { func }, middleware }`). `wireChannel` unwrapped the third shape for `onMessage` and `onMessageWiring`, but registered `onConnect` and `onDisconnect` as-is — so the registered config's `func` was an object, and the function runner threw when it tried to call it. All three shapes now register a callable config on every handler.

  `wireChannel`'s type arguments were also misaligned with `CoreChannel`'s parameter list: `PikkuPermission` was being passed into the `ChannelConnect` slot and `PikkuMiddleware` into `ChannelDisconnect`, which made `wireChannel({ onConnect: { func } })` fail to typecheck with "not assignable to `CorePikkuPermission`". End users did not see this — the CLI's generated `wireChannel` wrapper casts before calling core — but anyone importing `wireChannel` from `@pikku/core/channel` directly did. The signature is now `wireChannel<In, Channel>(channel: CoreChannel<In, Channel>)`; the three surplus type parameters were never used for anything correct and are gone.

- dcf20cb: Pin the public API, and declare which modules have import-time side effects

  Nothing caught a change to what `@pikku/core` publishes. An export could appear, vanish, or have a member's signature change, and the only signal was a downstream break after release.

  `public-surface.json` now pins every runtime export reachable through a `package.json` `exports` subpath, and `api-report.md` pins the API at **member** level — a method added to an interface is the change that breaks a consumer's build, and an export list cannot see it. Both regenerate from the code and are asserted against it, so widening the API is a visible diff rather than a side effect of an `export *`.

  The report is written to state what the API _is_ rather than merely list identifiers, so the diff is readable by a reviewer.

  `sideEffects` is declared as an allowlist rather than `false`: core genuinely has some. The error registry is built by `addError` calls that run on import, so claiming `sideEffects: false` would let a bundler drop it and leave `getErrorResponse` unable to find any error. A test detects the modules that actually have side effects and fails if the allowlist disagrees.

- 6512384: feat: give scenarios a `scenario.context` their `before`/`after` hooks can read

  A hook only ever received the run's _input_, so teardown could not reach an id
  the scenario body minted — which is exactly what a failing run needs to clean
  up. `wire.scenario.context` is a per-run scratch object shared by `before`, the
  body and `after`. It is typed as a `Partial` of the scenario's output, because a
  run that failed early has none of it.

  ```ts
  pikkuScenario<void, { projectId: string }>({
    func: async (_services, _data, { scenario }) => {
      const { projectId } = await scenario.when('creates a project', 'createsProject', …)
      scenario.context.projectId = projectId
      …
    },
    after: pikkuScenarioHook<void, { projectId: string }>(
      async (_services, _data, { scenario, actors }) => {
        if (scenario.context.projectId) {
          await actors.admin.invoke('deleteProject', { projectId: scenario.context.projectId })
        }
      }
    ),
  })
  ```

  Deliberately not a world: it is scoped to a single run, and scenario _steps_
  cannot reach it — state still flows between steps as return values.

  Feature-level `before`/`after` get the same member, scoped to their feature, so
  group setup can hand group teardown what it created. It is a separate object
  from the scenarios' contexts: one bag shared across a group is the invisible
  coupling a Cucumber world had.

- e3b4c14: Remove the `addTagPermission`, `addHTTPPermission` and `ZodLike` compatibility stubs

  Tag- and HTTP-route-level permissions were removed in #972; `addTagPermission` and `addHTTPPermission` survived only as throwing stubs so the pinned bootstrap CLI could resolve their imports at build time. `@pikku/cli@0.12.96` — the currently pinned bootstrap version — emits neither name, so the stubs and the `packages/cli/build.sh` rewrite rules that fed them are gone.

  Declare permissions on the function instead: `pikkuFunc({ permissions })`, or app-wide with `addGlobalPermission`.

  `ZodLike` was an alias for `StandardSchemaV1<T, T>` kept for generated code that no longer references it. Import `StandardSchemaV1` from `@standard-schema/spec` directly.

- efd0ed1: **An explicitly-`undefined` property no longer kills a step.** JSON Schema
  cannot describe such a property, so the validator rejected the whole instance
  rather than the field — `{ a: undefined }` threw
  `Instances of "undefined" type are not supported`. Whether a payload could
  contain one depended on how the call travelled: `JSON.stringify` drops those
  keys over HTTP, while an in-process dispatch hands the object over intact, so
  `workflow.do('step', 'rpc', { retries: data.maybeRetries })` failed only when
  the step ran inline. `validateSchema` now strips them first, and an
  explicitly-undefined _required_ field reports as the missing property it is.
- cba98fb: Security hardening sweep
  - **Content uploads require a signature**, matching reads. `handleUpload` previously validated the path and the size limit and then wrote the file, so an unauthenticated `PUT` to the upload prefix landed on disk. The express server, which verified nothing at all, now verifies both uploads and reads.
  - **The remote-RPC prefix is matched case-insensitively.** The router matches routes case-insensitively, so `/Remote/RPC/fn` reached the same handler while a case-sensitive `startsWith('/remote/rpc/')` let it past the mesh trust gate and the token's `fn` binding.
  - **Dev quick-login refuses proxied requests.** The gate checked the hostname only, so a request forwarded with `Host: localhost` was auto-provisioned a root-admin session. Proxy markers (`forwarded`, `x-forwarded-*`) now refuse regardless of what they claim, and dev login is inert in production.
  - **Logout clears the session cookie** instead of re-signing an absent session into a fresh, unexpired one.
  - **Short-flag cluster parsing is bounded**, closing a CLI-over-channel denial of service.
  - `allowedHosts` is carried into secret definition meta.

- ce96383: Split `pikku-workflow-service.ts` into composable modules and report missing workflow metadata as such

  `PikkuWorkflowService`'s module carried its error catalog, run-engine interfaces, queue routing and queue wiring alongside the class. Those now live in `workflow-errors.ts`, `workflow-run-engine.types.ts`, `workflow-constants.ts`, `workflow-meta-resolver.ts`, `workflow-queue-routing.ts` and `workflow-queue-wiring.ts`, with the approval and recovery paths in `workflow-approval.ts` and `workflow-recovery.ts`. The `@pikku/core/workflow` entry point exports the same names as before.

  Typing the workflow meta resolver surfaced a crash: a run whose workflow had no generated metadata threw `TypeError: Cannot read properties of undefined` from deep inside the runner, or `WorkflowNotFoundError` — neither of which points at the actual cause. It now throws `PikkuMissingMetaError`, matching how the queue and trigger runners already report the same condition.

- f8f1244: Tighten several public types that `as any` was masking
  - `AIStreamEvent`'s `approval-request` variant now declares `runId: string` rather than `runId?: string`. Every emitter already set it, and `AIAgentResult['pendingApprovals']` has always required it — the optional let `undefined` reach a field consumers rely on to resume a suspended run.
  - `PikkuWire` gains an optional `logger`. The no-op audit service already read `wire.logger` before falling back to the singleton, but nothing declared it, so a host had no typed way to attach an invocation-scoped logger.
  - `pikkuAuth`'s marker is now the exported `AuthBranded` type instead of an untyped property, so the brand that agent tool filtering depends on is visible to the type system at both the site that sets it and the sites that read it.

  Internally this takes core's non-test modules from 108 `as any` casts to none. Each is replaced by an assertion to the type actually wanted, or by a change to the surrounding types that makes the assertion unnecessary. A test holds the count at zero.

- f8f1244: Declare `CoreUserSession.readonly` and `ChannelMeta.gateway`, which the runtime already used

  The function runner throws `ReadonlySessionError` when a session is marked `readonly` and the function is not, but `CoreUserSession` never declared the field — so there was no typed way to build a readonly session, and even core's own test had to cast. Likewise `wireGateway` writes `gateway: true` onto a websocket channel's meta, which `ChannelMeta` did not admit. Both are now declared.

  The gateway websocket path also wrote channel meta without `input`, `disconnect` or `messageWirings`, all of which `ChannelMeta` requires and `channel-handler` indexes without a guard. It now writes a complete record.

- 6e93a35: Give each wire an explicit set of crossovers

  `wire.rpc.agent` was implemented inline in `rpc-runner.ts`, which put the agent turn logic — run, stream, resume, interrupt, approve — inside the RPC primitive. It moves to `ai-agent/agent-rpc.ts`, next to the runner and stream code it delegates to; `rpc-runner` imports it and the getter stays, so a request that never touches an agent never builds the facade.

  The wires (`http`, `channel`, `queue`, `scheduler`, `cli`, `rpc`, `ai-agent`, `workflow`) previously imported each other ad hoc, so an accidental edge was indistinguishable from a designed one. Each wire now declares the crossovers it is allowed, and a test walks the import graph to hold it — failing both on an undeclared edge and on a declared crossover that no longer exists, so the declaration cannot rot into a rubber stamp.

  `unsupportedChannelRemote` moves from `channel-rpc-service.ts` to `channel-rpc.types.ts`, alongside the error it throws.

  The shared storage conformance suite splits from one 1216-line module into one module per service, so a backend author can read the contract for the service they implement. `defineServiceTests` is unchanged for callers.

- 6dada45: fix(workflow,ai-agent): make a run's owner, entry node and step function authoritative

  A graph run may only start at a node the graph declared in `meta.entryNodeIds`, and
  the generated `POST /workflow/:workflowName/graph/:nodeId` route that let an HTTP
  caller pick the entry node is gone. `startNode` stays for `PikkuTriggerService`,
  which names a declared entry node anyway.

  `StepState` now records the `rpcName` the workflow dispatched a step with, and the
  step claim rejects a queue message naming a different function with
  `WorkflowStepFunctionMismatchError` before mutating any status — a step runs under
  the run owner's identity and without the `expose` gate, so the message must not
  choose what runs.

  `approveStep` takes the caller's session, and the generated status routes and
  streams assert the same `assertWorkflowRunOwner` check: a run started through a
  session may only be read and approved by that session's user. A run with no
  recorded owner (trigger, scheduler, unauthenticated route) has nobody to compare
  against and is still gated by the entrypoint's own `auth`/`permissions`.

  `AIRunStateService.resolveApproval` is now a compare-and-swap returning whether
  _this_ caller made the claim, and both agent resume paths run a tool only for the
  approvals they claimed — concurrent approvals of one tool call no longer all
  execute it.

## 0.12.79

### Patch Changes

- e848eb2: Add `relayUndispatchedSteps()`, which re-drives steps whose queue or scheduler
  dispatch was lost.

  Arming a step is two writes to two systems — the step row lands `pending`, then
  a job is published — and nothing spans both, so a crash in between leaves a
  durable row nothing will ever pick up. The run then neither finishes nor fails.

  The step row is the outbox record and this is the relay. It is safe to
  re-dispatch a step that already has a live job because `executeWorkflowStepInner`
  claims the step under `withStepLock` before invoking anything: the loser reads
  `running` and returns. Stores opt in by overriding `findUndispatchedSteps`; the
  default returns nothing, so a store without an atomic step lock gains no
  re-dispatches. Opted in: `kysely-postgres` and `kysely-mysql` (real locks) and
  in-memory (inline, single-process, no queues). Not opted in: `mongodb` and
  `kysely-sqlite`, whose `withStepLock` is a pass-through.

  Not self-starting — call it from a scheduled task.

- b170489: Gateway handlers now run under the metadata their author actually wrote, instead
  of a fabricated meta object.

  `registerGatewayHandler` used to synthesize `{ sessionless: true,
inputSchemaName: null, outputSchemaName: null }` for every gateway handler, so a
  function declared with `pikkuFunc` — which records "session required" in meta
  rather than through an `auth` property — was silently made sessionless, and its
  input schema was never validated. It now inherits `sessionless`, the schema
  names, `scopes` and tag middleware from the function the gateway was wired with,
  falling back to the old sessionless default only when nothing was declared (a
  gateway wired by hand rather than through codegen).

  Tag middleware also reaches gateways for the first time. `addTagMiddleware('x',
…)` combined with `wireGateway({ tags: ['x'] })` previously resolved to nothing
  at all — the inspector computed the middleware and no runtime path read it — so
  a tag that read like a gate applied none.

  **Both are tightening changes.** A gateway whose handler declared a session
  requirement, or whose tags name registered middleware, now enforces what it
  already said it enforced.

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

## 0.12.78

### Patch Changes

- f5ce870: Recover workflow runs stalled by a crash mid-dispatch.

  Arming a step is two writes to two systems — the step row, then the queue or
  scheduler job — so a process that died between them left a run `running` with
  nothing in flight. It parked on a step that would never complete and never
  error, so the run neither finished nor failed, and nothing swept it up.

  `workflowService.recoverStalledRuns()` re-drives those runs through
  `resumeWorkflow`. Replay is memoized per step, so resuming a run that was not
  actually stuck changes nothing; runs mid-sleep or with a step in flight are
  excluded outright. It is not self-starting — call it from a scheduled task.

  Stores opt in by overriding `findStalledRunIds`; implemented here for the
  Kysely and in-memory services, and a no-op elsewhere.

## 0.12.77

### Patch Changes

- 3df4f95: Scaffold virtual user runs as RPCs, backed by a run store.

  `pikku persona run` could already turn a declared persona loose on a running
  stage, but only from a terminal, and the result only existed in that terminal's
  output. There was no way for CI, a console, or a scheduled job to start a run —
  and nothing kept what a run found, so this week's findings could not be compared
  against last week's.

  `scaffold.virtualUser` now generates two RPCs and the function behind them:
  - `runVirtualUser({ persona, goals?, memory?, disposition?, budget?, seed? })
-> { runId }`
  - `getVirtualUserRun({ runId }) -> { status, findings, tally, memory, … }`

  They are gated on separate scopes — `virtualUser:run` and `virtualUser:read` —
  because an adversarial run's findings are working exploits carrying live ids,
  which makes reading them the more sensitive of the two. Production refuses every
  disposition but `accountable`, checked against the effective one so the
  per-run override cannot smuggle another in.

  **A run is not a workflow and not a queued job.** It explores, so no two
  attempts take the same steps and there is nothing to replay; and the record
  already carries the progress a queue would only be holding on the way to the
  same place. `runVirtualUser` writes the record, dispatches without awaiting, and
  returns the id. The cost is stated on the type: a restart mid-run strands a
  record at `running`, so a run older than its budget window and still `running`
  is dead rather than working.

  `@pikku/core` gains `VirtualUserRunStore` (with `virtualUserRunStore` on
  `CoreSingletonServices`), and `@pikku/kysely` ships
  `KyselyVirtualUserRunStore`, which creates its own table on first use like the
  audit sink — the runtime never needs it, so it arrives with the feature that
  fills it rather than in every database.

  Also in core: `prepareVirtualUserRun`, which derives the catalogue, intents,
  scopes and reachable agents in one place. `pikku persona run` reads the
  inspector state and the generated RPC reads `metaService`, and the two have to
  agree — otherwise the same persona and seed explore a different API depending on
  how the run was started. `personaScopes` moved here from the CLI for the same
  reason and is still re-exported from its old home. `PRODUCTION_DISPOSITION` is
  now exported from `@pikku/core/virtual-user`, which it should always have been.

## 0.12.76

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

## 0.12.75

### Patch Changes

- 32277d5: Make a voice conversation with an agent something a chat surface can turn on, rather than
  something each consumer reassembles.

  The server half already worked — `voiceInput` transcribed, `voiceOutput` synthesized a
  sentence at a time, and the AG-UI mapper forwarded the audio. What was missing was the
  turn's own words. The client sends audio, so only the server ever knows what was said,
  and nothing carried that back: a spoken turn rendered as an empty user bubble followed by
  an answer to a question nobody could see, and thread history recorded the base64 audio
  blob instead of the transcript — megabytes of unreadable data in place of the only
  readable record of the turn.

  `voiceInput` now records what it heard, the stream emits it as a `transcript` event ahead
  of the run (the reply starts within a few hundred milliseconds, and a question that
  appears after its answer reads as the wrong question), and it reaches the browser as
  `pikku:transcript`. Both run paths persist the transcribed message rather than the one
  that arrived on the wire. `audio-delta` also carries the sentence it says, which is what
  a barge-in needs to report the part the user actually heard — a reply cut off after "I'll
  delete the staging database and" is answered very differently depending on whether the
  model knows the sentence never landed.

  `@pikku/voice-agents` gains the two things a voice UI needs and could not get: a live
  input level, attached to the source rather than to a detector so it keeps reading on the
  Silero path, and the microphone list — re-readable on demand, because device labels are
  empty until permission is granted and nothing fires when it is. `VoiceSession` also
  learned manual turn boundaries, so push-to-talk is a mode rather than a detector fought
  to a standstill: holding the key through a three-second pause is someone thinking, and
  any endpointer worth having would cut them off.

  `<PikkuAgentChat voice />` puts a microphone beside the send button, promotes it to
  primary when nothing is typed, and opens an indicator with a live level bar, a device
  picker and a hold-to-record toggle. It plays the agent's speech, and cancels the run on
  barge-in — talking over the agent should stop the bill, not just the sound.

  Opt-in, because the component cannot check the two things it depends on: the agent has to
  be wired with `voiceInput` for the audio to be understood and `voiceOutput` for anything
  to come back.

- ea8aabf: Serve `LocalContent` uploads and signed reads under Bun.

  `LocalContent` hands the browser a `PUT <uploadUrlPrefix>/<key>` upload URL and a signed
  `GET <assetUrlPrefix>/<key>` read URL, but it is a `ContentService` and cannot answer
  either — something in the serving path has to. Only `@pikku/node-http-server` did. The
  same project served under Bun handed out upload URLs that 404ed, with nothing naming the
  cause: the config was accepted, the service was constructed, and the URLs looked right.

  `@pikku/core` now exports `createLocalContentRequestHandler` from
  `@pikku/core/services/local-content-request-handler` — the server half of `LocalContent`,
  expressed in Web `Request`/`Response` so every runtime shares one implementation of the
  signature check rather than each re-deriving it. It returns `null` for anything that is
  not a content request, which is the caller's signal to carry on with its normal routing.

  `PikkuBunServer` accepts `config.content` and a `contentSigningJWT` option, mirroring
  `PikkuNodeHTTPServer`, and answers both prefixes ahead of static mounts and routing.
  `BunServerRunner` was dropping `contentSigningJWT` on the floor, which silently disabled
  signed asset reads for every Bun project even once the prefixes were served — the config
  arrived, the service that verifies its signatures did not.

  Signed reads are refused unless every claim matches, the path included: without that, a
  signature minted for one asset would read any other.

- 33e96ab: Make a CLI served over a channel typecheck in a real project.

  Both of these are unreachable for a hand-written `wireChannel`, whose routes are usually
  bare identifiers, and unavoidable for a CLI one, whose routes are command ids.

  `ChannelsMap` emitted route and message keys unquoted. A command id is a kebab or dotted
  name far more often than not — `app-smoke`, `registry.search`, `package.upgrade-pikku` —
  and each one ends the property early, so the generated map is not parseable TypeScript at
  all. One project's map came out with 107 syntax errors from a single CLI channel. Keys are
  now quoted when they are not bare identifiers, and left alone when they are, so existing
  generated output is unchanged.

  `executeRawCLIViaChannel` typed its renderers `Record<string, CorePikkuCLIRender<any>>`,
  whose services parameter defaults to `CoreServices`. The renderers a generated client
  passes are the app's own, typed against its `SingletonServices`, and a function taking
  those is not assignable to one taking `CoreServices` — so the generated client failed to
  compile for any app that adds a service, which is every app.

  Rather than widen the type, it now says what is actually true on that side of the socket:
  a renderer running on the client gets a logger and nothing else, because there is no
  service container there to resolve anything from. `CorePikkuCLIClientRender` and
  `ClientCLIRenderServices` are new exports of `@pikku/core/cli/channel`. They are not
  expressible as `CorePikkuCLIRender`, whose `Services` parameter is constrained to
  `CoreSingletonServices` and so demands a `config`, `variables` and `secrets` the client
  cannot invent. The one cast from the app's renderer type to that shape is localised to the
  generated client, where it is sound: generation refuses to emit the file at all if a
  renderer reaches for a service other than `logger`.

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

## 0.12.74

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

## 0.12.73

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

- ba6cc08: fix: stop leaking internal error detail and bound the request body size

  HTTP error responses no longer forward an error's `payload` or its raw `message` for
  registered 5xx errors — those responses carry the registered error message instead, so an
  internal error that happens to hold a `payload` cannot leak it to the client. Errors
  registered with a 4xx status keep their message and payload, and `exposeErrors` still
  surfaces the full detail outside production.

  `PikkuFetchHTTPRequest` now caps how much of a request body it buffers, rejecting the
  declared `content-length` up front and measuring the stream as it arrives so a lying or
  absent header cannot exhaust memory. Exceeding the limit throws `PayloadTooLargeError`
  (413). The ceiling defaults to 10MB and is configurable via the new `maxBodySize` option on
  the constructor and on `RunHTTPWiringOptions`.

- d007191: `cors()` takes an `exposeHeaders` option.

  Without `Access-Control-Expose-Headers` a cross-origin caller can read only the
  CORS-safelisted response headers, so any header the client is meant to act on was
  invisible to it. The cross-site session relay in `@pikku/better-auth` is the case that
  surfaced it: the client cannot read `x-pikku-cross-site-set-cookie` off a cross-origin
  response without being told it may.

  Defaults to none, so nothing new is exposed unless it is named.

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

- ba6cc08: Security hardening: removed the gopass secret service and stopped MCP internal errors leaking stack traces.

  **Breaking:** `GopassSecretService` and the `@pikku/core/services/gopass-secrets` subpath export are gone. The service shelled out to the `gopass` binary and its key validation accepted `../`, so a caller-supplied key could traverse out of the configured prefix namespace and read secrets outside it. Rather than harden a shell-out that few projects used, the service is removed. Anyone importing it should implement `SecretService` against their own secret backend. Pre-0.13 breaking changes still ship as a patch.

  MCP internal errors (JSON-RPC `-32603`) previously always attached `data: { message, stack }`, handing any MCP client an internal stack trace. That payload is now gated on `exposeErrors`, which defaults to `!isProduction()` — the same convention `handleHTTPError` already uses. In production a client receives a bare `Internal error` with no `message` and no `stack`; `RunMCPEndpointParams` accepts an explicit `exposeErrors` to override the default.

- a2e21e5: Keep the persona runtime off the production barrels

  `@pikku/core/services` exported `HttpPersona`, `createHttpPersonas` and
  `readScenarioHttpResponse` as values, and `@pikku/core/workflow` exported
  `readScenarioHttpResponse` and `postScenarioJson`. Both are barrels a production
  server imports, and `http-personas` reaches the actor-flow conversation runner
  and through it the agent runner — so signing-in-as-a-persona machinery sat in the
  module graph of every app that imported services.

  Tree-shaking only removes that if you bundle. An unbundled Node or Lambda deploy
  loads whatever the graph names, which is the case this matters in.

  The values now come from `@pikku/core/persona`, which is where the rest of the
  persona API already lives. **Types stay exactly where they were** — `import type`
  erases, so it costs a bundle nothing, and moving them would put core in a cycle
  with the code that describes its own function types.

  `serialize-personas` generates the new import, so a regenerated
  `pikku-personas.gen.ts` picks it up with no edit. Anything importing these four
  values from `@pikku/core/services` or `@pikku/core/workflow` changes the
  specifier to `@pikku/core/persona`; the names and signatures are unchanged.

  A test walks each barrel's value-import graph and fails if scenario runtime
  reappears, so this cannot regress quietly.

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

## 0.12.72

### Patch Changes

- 384e484: Apply schema defaults, which nothing was ever filling in

  A `default` on an input property reaches the generated JSON Schema and keeps
  that property out of `required`, so a call that omits it validates. Nothing
  then filled it in: JSON Schema validators are pure by specification, and
  neither `@cfworker/json-schema` nor Ajv (without `useDefaults`) annotates the
  instance being checked. The function received `undefined` for a property its
  own generated type declares as present.

  That is the worst shape the mismatch can take. Validation permits the omission,
  the type promises a value, and the body reads `undefined` — so it surfaces far
  from its cause, as `const offset = (page - 1) * limit` evaluating to `NaN` and
  `.limit(undefined)` reaching the database on a paginated call made with no
  arguments.

  Defaults are now filled in before validation, on every path. Deliberately not
  gated on `coerceDataFromSchema`, the flag guarding the neighbouring coercion
  step: that flag is about decoding transport-encoded values (a query string's
  `"1,2"` into an array) and is absent on a direct RPC invocation. A default
  belongs to the schema rather than to the transport a call arrived on, so
  gating it there would fill defaults over HTTP and skip them on RPC.

  Filling is by presence rather than truthiness, so a supplied `0` or `false`
  survives, and a call made with no arguments at all still gets its defaults.
  Values are cloned, because an object or array default would otherwise be a
  single mutable instance shared by every request in the process — one request's
  `push` showing up in the next.

  Nothing needs to change in generated types or call sites: both were already
  written as though defaults worked. This makes them true.

- b5a73fb: fix: stop leaking internal error detail and bound the request body size

  HTTP error responses no longer forward an error's `payload` or its raw `message` for
  registered 5xx errors — those responses carry the registered error message instead, so an
  internal error that happens to hold a `payload` cannot leak it to the client. Errors
  registered with a 4xx status keep their message and payload, and `exposeErrors` still
  surfaces the full detail outside production.

  `PikkuFetchHTTPRequest` now caps how much of a request body it buffers, rejecting the
  declared `content-length` up front and measuring the stream as it arrives so a lying or
  absent header cannot exhaust memory. Exceeding the limit throws `PayloadTooLargeError`
  (413). The ceiling defaults to 10MB and is configurable via the new `maxBodySize` option on
  the constructor and on `RunHTTPWiringOptions`.

- 6be5ab0: Security hardening: removed the gopass secret service and stopped MCP internal errors leaking stack traces.

  **Breaking:** `GopassSecretService` and the `@pikku/core/services/gopass-secrets` subpath export are gone. The service shelled out to the `gopass` binary and its key validation accepted `../`, so a caller-supplied key could traverse out of the configured prefix namespace and read secrets outside it. Rather than harden a shell-out that few projects used, the service is removed. Anyone importing it should implement `SecretService` against their own secret backend. Pre-0.13 breaking changes still ship as a patch.

  MCP internal errors (JSON-RPC `-32603`) previously always attached `data: { message, stack }`, handing any MCP client an internal stack trace. That payload is now gated on `exposeErrors`, which defaults to `!isProduction()` — the same convention `handleHTTPError` already uses. In production a client receives a bare `Internal error` with no `message` and no `stack`. `RunMCPEndpointParams` accepts an explicit `exposeErrors` to suppress the detail outside production as well; it cannot force the detail on in production, because the check is `exposeErrors && !isProduction()` — again matching `handleHTTPError`.

## 0.12.71

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

- 09973b9: Scenarios, features and steps no longer reach a deployment.

  Steps were already held back from the app bootstrap, so a deployed server never imported a step body. Everything _about_ a scenario still travelled with the application: a `pikkuScenario(...)` is a function, so its name, schemas and hashes sat in the app function meta; the schemas it and its steps validate against sat in the app's `register.gen.ts` — on one project 458 of the 582 registered schemas belonged to tests; its name sat in the internal RPC meta; and because a scenario is _also_ a workflow, the inspector synthesised a `wf-orchestrator-<scenario>` queue worker for each one. The deploy analyzer, which reads inspector state rather than the partitioned codegen output, then read all of it back as application code: a unit per scenario, a `WorkflowDefinition` per scenario, and a real queue per scenario. A 13-scenario suite turned into 13 production queues named after tests, waiting for a provider to create them.

  The existing scenario/app partition is now applied everywhere it was missing. `FunctionRuntimeMeta` gains a `scenario` marker (the counterpart of `scenarioStep`) so a scenario body is recognisable without walking the workflow graph; scenario bodies join their steps on the scenario side of the function-meta and registration split; schemas only a scenario or step needs are written and registered under `.pikku/scenarios/schemas/` and imported by the scenario bootstrap alone; scenario names are dropped from the internal RPC meta; no orchestrator queue worker is synthesised for a scenario; and the deploy analyzer drops both scenario functions and scenario workflows before it decides what a deployment contains.

  The MCP metas are keyed by wiring rather than by function, so a scenario wired as an MCP tool, resource or prompt was the one id that still reached the manifest after the function and workflow filters — as an endpoint on the gateway plus a gateway dependency on a unit that was never emitted. Those ids are now filtered too.

  `scenarioSchemaDirectory` is rejected when it resolves to the same directory as `schemaDirectory`. A schema write owns its directory — it emits `register.gen.ts` and prunes every schema file its own required-set does not name — so sharing one would replace the application register with the scenario-only one and delete the app's schema files, which nothing downstream can detect.

  Nothing changes for `pikku scenario run` — the scenario bootstrap still registers every scenario, feature, step, meta and schema. What changes is that a bundle stops carrying them.

## 0.12.70

### Patch Changes

- 539ee0b: Give browser scenario steps a shared way to name an element: `browser.locate(selector)`. `TestIdSelector` (test id, `prefix`, `where` data attributes, `containing` text, `within` scope) is declared in core so a step's input stays structural, and `@pikku/playwright` resolves it against the page — applying `:visible` by default, since Mantine layouts routinely mount a hidden copy of a control.
- a1a6816: Let a scenario actor declare the scopes and roles it holds

  `scenarios.actors.<name>` in `pikku.config.json` now takes optional `scopes` and
  `roles`, carried through to `scenarioActorConfigs`. Pikku never applies them —
  which scope store exists and which roles have been created is the app's own — so
  the generated actors file also exports `scenarioActorList`, the registry widened
  to `ScenarioActorConfig`, which is what a seed needs to read an optional field
  off every actor.

- dc3e11e: Generate scenarios, features and scenario steps into `.pikku/scenarios/` with their own bootstrap, so a deployed server never imports a step body.

  A `pikkuScenarioStep` body is an ordinary pikku function and a `pikkuScenario` is an ordinary workflow, so codegen wired both into `pikku-functions.gen.ts` and `pikku-workflow-wirings.gen.ts` — the files every server's bootstrap imports. A project's steps, and whatever a step imports (Playwright, fixtures, assertion helpers), therefore shipped in production. The e2e project's app bootstrap pulled in 20 step modules and 7 scenarios this way.

  Codegen now partitions on the flags that already existed — `scenarioStep: true` in function meta and `source: 'scenario'` in workflow meta — and emits:

  ```
  .pikku/scenarios/pikku-scenario-functions.gen.ts       addFunction for every step
  .pikku/scenarios/pikku-scenario-functions-meta.gen.ts  step meta, merged onto the app's
  .pikku/scenarios/pikku-scenario-wirings.gen.ts         addWorkflow + addFeature
  .pikku/scenarios/pikku-scenario-wirings-meta.gen.ts    scenario meta, merged onto the app's
  .pikku/scenarios/meta/*.gen.json                       per-scenario graph meta
  .pikku/pikku-bootstrap-scenarios.gen.ts                imports the app bootstrap, then the above
  ```

  `pikku scenario run` is the only thing that loads `pikku-bootstrap-scenarios.gen.ts`; `pikku dev` and `pikku serve` keep loading `pikku-bootstrap.gen.ts`. Bundling the e2e app bootstrap now resolves **zero** scenario or step modules.

  Both meta files _merge_ rather than replace — `pikkuState(…, 'meta', value)` is a wholesale setter — and each imports the app meta file it merges onto, so the ordering holds regardless of entry point. Features move wholesale to the scenario side: `serializeWorkflowRegistration` no longer emits `addFeature` at all.

  `LocalMetaService` reads the new locations alongside the old ones (`scenarios/meta` in `getWorkflowMeta()`, `pikku-scenario-functions-meta.gen.json` in `getFunctionsMeta()`), so the console's scenario list and function meta are unchanged — those read from disk, not from the bundle. Scenario meta left behind in `workflow/meta` by an earlier CLI is removed on the next codegen, so it cannot be served as a stale duplicate.

  **Not included:** a scenario step's input/output JSON schemas still register in the app's `schemas/register.gen.ts`. They are inert data rather than a module edge, and splitting them safely means deriving "required only by a step" across every other schema consumer — a wrong answer there unregisters a schema the server validates against.

- 24da616: `createCookieJar` is now the one place a scenario keeps a session. `HttpScenarioActor` is built on it rather than tracking a single cookie string of its own, which means it follows a cookie the target rotates on any response — previously only the sign-in response was read, so a rotated session cookie was dropped and the only recovery was the 401 re-login.

  It is exported from `@pikku/core/workflow` because a step driving a real auth client SDK needs the same thing an actor does.

  Two fixes to what the jar holds. A `Set-Cookie` with an empty value is how a target **deletes** a cookie, so the name is now dropped rather than held with a value that says it is gone; and a `cookie` header the caller already set is merged with the jar's rather than silently replaced, which matters when the jar is handed to an SDK as its `customFetchImpl`.

  `HttpScenarioActor` no longer reads `jar.empty` to decide whether it is signed in — it tracks the sign-in. `empty` is a fact about the jar, not about the session: a target that sets a CSRF or locale cookie before anyone signs in filled it, which made the actor skip its first `login()` and send that call unauthenticated, and made the "sign-in returned no session cookie" guard pass without a session ever being established. That guard now checks the sign-in response's own `Set-Cookie`.

- 04bfe3f: Scenarios get a fresh browser each time, a failure report worth reading, and a formatter that owns the output.

  Three changes that only make sense together.

  **A scenario no longer inherits the last one's browser.** `ScenarioBrowserProvider` gains an optional `reset()`, called between scenarios: every actor's context — cookies, storage, open pages, in-page listeners — is discarded, while the browser itself stays up. Before this, one browser context per actor lived for the whole run, so scenario 2 started signed in as whoever scenario 1 left behind. The boundary is the context rather than the browser because that is where the isolation actually lives, and re-opening one costs milliseconds instead of a relaunch. `reset()` runs _before_ each scenario, so the last one's window is still there to look at when a headed run stops.

  **A failure says what happened.** The runner reported `run.error.message` and nothing else — which for a browser step is "Timed out waiting for selector" with every useful detail removed. `ScenarioBrowserProvider` gains an optional `captureFailure(label)`, and the driver's page diagnostics (console errors, uncaught exceptions, failed requests, 4xx/5xx API responses) — collected all along and until now thrown away — are reported under the failing step, with a screenshot written to `<outDir>/scenario-failures`:

  ```
    ✗ failed at: Then  the admin sees the edit button
      Timed out waiting for selector button[title="Edit function"]
      browser (admin): http://localhost:4077/console/functions
        console:    TypeError: x is not a function
        api:        500 /api/rpc/console:readFunctionSource
        screenshot: .pikku/scenario-failures/code-editor-admin.png
      at readsFunctionSource (…/code-editor.steps.ts:71:5)
  ```

  Stacks are trimmed to the project's own frames, because the framework's are never the bug; `--trace` keeps all of them. An expected failure (a `PikkuError`) prints its message alone — a stack adds nothing to a deliberate one.

  **A failed scenario now shows its ladder at all.** It did not before, for a reason that took a live run to find: an inline run that fails throws out of `startWorkflow` instead of returning `{ runId }`, so the runner never learned the id of the one run whose steps were worth reading — and fell back to the run error alone. `startWorkflow` gains an `onRunCreated` option, called the moment the run exists, which is the only point guaranteed to happen whether the run goes on to pass, fail or suspend. A failure now prints every step that ran, marks the one that didn't, and names it in `✗ failed at:`.

  A browser timeout's `message` carries its entire call log, so the summary line and the ladder row take its first line only — the block underneath still prints all of it. Three copies of the same paragraph, one of them wrapping mid-table, is not a report.

  **All of that output now goes through one formatter.** `formatScenarioReport(report)` takes a plain serialisable report — no Maps, no meta handles — and returns the lines to print, the way `deploy plan` already works. Joining a run to the prose that declared it stays in `scenario-ladder.ts`, where the inspector state is; laying it out is the formatter's job. A second reporter (JSON, JUnit) is now a function rather than an excavation.

  **Browser drivers are pluggable.** `scenarios.browserDriver` in `pikku.config.json` names the package that drives `browser: true` steps; it defaults to `@pikku/playwright` but nothing requires it. A driver is any package exporting `createScenarioBrowserProvider(options)` — or a provider class — returning an object with `sessionFor()` and `close()`. `reset()` and `captureFailure()` are optional, so a driver written against the earlier interface keeps working: it simply offers no isolation and no diagnostics. A package that is neither says so, instead of failing later in a way nobody can read.

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

- cd6453c: `ScenarioHttpResponse` is what an actor's transport answers with.

  Nothing about the shape (status, ok, body) is RPC-specific — it is an HTTP response with its body already drained — so it is not named for RPC, and it carries `serialized`, the body as text. `readScenarioHttpResponse(res)` is exported so a step that has to reach past `invokeRaw` for a non-RPC route drains the response the same way instead of inventing its own record, and `invoke`'s refusal error quotes the raw text, so an HTML or plain-text error body says what went wrong instead of `"undefined"`.

  Both are generic in the body — `readScenarioHttpResponse<{ runId?: string }>(res)` — defaulting to `unknown`. A body that will not parse as JSON is carried as its raw text rather than dropped.

  The whole scenario-actor surface is new and unreleased, so there is nothing here to migrate from.

- a436645: Redesign the console's scenarios screen as living documentation of a project's BDD features.

  The inspector now statically extracts `pikkuFeature` declarations — name, description, tags, the scenarios each one groups (including `{ scenario, data }` examples), and whether it declares `before`/`after` — and the CLI writes them to `<outDir>/scenarios/features.gen.json`, which `MetaService.getFeaturesMeta()` reads and the console addon returns from `getAllMeta`.

  The scenarios page reads that back as a document: features on the left, and on the right the selected feature's scenarios, each rendered as the given/when/then ladder of prose its author actually wrote, with repeats shown as `for each x in xs`, `Examples:` tables for parameterised entries, skip reasons stated rather than hidden, and each scenario's cast of personas inline. The Flows/Personas segmented control is gone; tags filter the document the same way `pikku scenario run --tags` filters a run.

- 46cf63e: Scenario personas — the KIND of person, separate from the body that signs in

  `scenarios.actors` conflated two things: who a kind of person is, and which
  synthetic user a step runs as. That works until a scenario needs two of the same
  kind — tenant isolation, peer sharing, a member hitting another member's row —
  at which point the registry grows two near-identical entries and neither says
  they are the same kind of person.

  `scenarios.personas` now declares the kinds:

  ```json
  "scenarios": {
    "personas": {
      "owner": { "description": "Owns their own entries", "primary": true },
      "viewer": { "description": "Someone the owner shares with", "proficiency": "casual" },
      "reminders": { "description": "The app sending reminders", "kind": "system" }
    }
  }
  ```

  A persona carries only what is true of that kind of person for the app's whole
  lifetime — `description`, `primary` (whose experience the product is), `kind`
  (`person` or `system`), `proficiency` (`casual` or `power`). What someone is
  trying to get done, and the circumstances they are doing it in, belong to the
  scenario, not to them.

  Actors are materialised from personas, so the common case — one body per kind —
  needs no `actors` block at all. Declare an actor by hand only for a second body
  of one persona:

  ```json
  "actors": { "ownerB": { "persona": "owner", "email": "owner-b@actors.local" } }
  ```

  A `system` persona mints no actor: there is nobody to sign in.

  Resolution is shared by codegen and `pikku scenario run` (previously three
  independent reads of `config.scenarios.actors`), so the generated
  `scenarioActorConfigs` — and therefore the `ScenarioActorName` union that types
  `wire.scenarioStep.actor` — always matches the registry a run builds. Two actors
  sharing an email is now an error rather than a silently-shared user row, which
  is exactly the bug a second body exists to catch.

  Fully backwards compatible: an actor with no `persona` resolves as its own
  implicit persona, and a project with no `personas` block is untouched.

  Because "persona" now names a config entity, actor-flow no longer uses it for
  "the actor config the LLM plays": `RunConversationParams.persona`/`personaName`
  are now `actor`/`actorName`, and the exported `PersonaLLM` type is `ActorLLM`.
  The `'in-persona'` approval policy value is unchanged — it is the English idiom
  ("stay in character"), not a reference to a declared persona.

- 9e666bc: `postScenarioJson(url, { body, headers })` — one way for a scenario step to POST JSON at a route and keep what came back.

  Every step that reaches past an actor was writing this by hand, and the copies had drifted. Two of them answered `response.json()`, which discards the status and **throws outright** when the target answers an empty body or an HTML error page — so a refusal, which is the expected outcome of a permissions scenario, surfaced as a parse error instead of as data. It returns a `ScenarioHttpResponse`, never throws on a non-2xx, and takes an optional `fetch` so a call that has to keep a session can be sent through a `ScenarioCookieJar`.

  `ScenarioHttpResponse` and `readScenarioHttpResponse` are now generic in the body: `postScenarioJson<{ runId?: string }>(…)` types `body` at the call site instead of casting at every use. The default is still `unknown`, so nothing that omits the parameter changes.

  `body`'s doc now says what it always did: a body that will not parse as JSON is carried as its raw text, not dropped.

- 1c841d8: Move the scenario engine off `PikkuWorkflowService` onto a `PikkuScenarioService` the runner constructs, so no production bundle carries it.

  Scenario support was built as members of `PikkuWorkflowService` — the class every Pikku server instantiates. A bundler drops an unused _module_, never an unused class _member_, so every deployed app was shipping the step runner, the lifecycle-hook runner, the actor registry, the browser-provider hooks and the `expectEventually`/`expectError`/`expectService` assertion wire, whether or not it had a single scenario. `resolveScenarioActors` pulled the HTTP actor client — and the AI persona conversation loop behind it — in with them.

  All of it now lives in `PikkuScenarioService`, exported from a new `@pikku/core/scenario` entry point and reached only by `pikku scenario run`:

  ```ts
  import { createScenarioRunner } from '@pikku/core/scenario'

  const { workflowService, scenarioService } = createScenarioRunner()
  ```

  Measured with esbuild against `InMemoryWorkflowService`: the production bundle drops 35 KB and every `sign-in/actor`, `runConversation`, `expectEventually` and `ScenarioHookError` occurrence, along with the scheduler runner that `wire.runScheduledTask` pulled in. The one remaining `scenarioStep` reference in a production bundle is the RPC guard that refuses to expose a step over `/rpc` — a security check, not scenario machinery.

  `PikkuScenarioService` is **not** a workflow service. A scenario is not a different kind of run — it is the same durable run with a step vocabulary on top — so it is installed onto one rather than subclassing it. `PikkuWorkflowService` gains a single `setRunExtension(create)` slot, and calls the installed `WorkflowRunExtension` at six points: `attachRunContext`, `detachRunContext`, `decorateRunWire`, `decorateWorkflowWire`, `onBeforeRunFunc`, `onAfterRunFunc`. Nothing on that interface names scenarios.

  The extension is built from a `WorkflowRunEngine` handle the service hands it — `inlineStep`, `updateRunStatus`, `onChildWorkflowFailed`, `verifyStepName` — which is what lets a scenario record a durable step without any of those becoming public API on the service every production app instantiates.

  ```ts
  const workflowService = new InMemoryWorkflowService()
  const scenarioService = workflowService.setRunExtension(
    (engine) => new PikkuScenarioService(engine)
  )
  ```

  `{ actor }` on a workflow step is deliberately **not** part of the move: `scenario.do(name, rpc, data, { actor })` dispatches through the base wire's `do`, so the actor branch stays in `rpcStep`.

  **Behaviour change:** a scenario started on a _server_ rather than through the runner (the console can start any registered workflow by name) no longer resolves actors or runs `before`/`after` hooks — a server's workflow service is not a scenario service. Run scenarios with `pikku scenario run`.

- 47478a4: Let a scenario declare why it is held out of a default run.

  `pikkuScenario({ skip: 'why' })` keeps the scenario in the plan and reports it as `SKIP <name> (<reason>)` on the ladder, instead of the alternatives available until now: deleting it, commenting it out, or leaving it red. Naming it directly with `--flows` clears the quarantine and runs it; selecting the feature it belongs to does not, because a feature is a group and running the group should not silently drag a quarantined member in.

  The run report's `skipped` list now carries a reason per scenario rather than assuming `--no-browser`, so a browser scenario held back on a machine with no browser reads differently from one the project quarantined itself.

  `@pikku/console` gains a test id on the addon detail page's Setup tab, which was previously only reachable through its translated label.

- 9e666bc: Settle what a scenario step imports from `@pikku/core/workflow`.

  Core carries what the scenario runtime contract needs — the step wire, the browser-driver interface, the transport's response shape — and what core itself implements. Two helpers that had been promoted alongside them are neither, and are not exported: `describeValue`, a one-line formatter for an assertion message, and `readScenarioSseEvents`, a general SSE reader with a scenario-flavoured name. Both are a test suite's own vocabulary, with no consumer inside the framework; a project that wants them owns them, at three and twenty lines. Neither shipped, so nothing to migrate.

  What stays, and why:
  - `requireActor(scenarioStep)` / `requireScenarioEnv(scenarioStep)` — narrow the optional halves of the step wire, naming the step and what to pass.
  - `pollUntil(attempt, { timeoutMs, intervalMs })` — retries until `attempt` answers anything but `undefined`, then answers with it. Reaching the deadline answers `undefined` rather than throwing, because only the caller knows what was being waited for and can say so. `@pikku/playwright` waits on it too.
  - `createCookieJar` and `readScenarioHttpResponse` / `postScenarioJson` — `HttpScenarioActor` is built on all three, so a step producing the same record reaches the same function.
  - The browser-driver interface, and the reporter's `composeStepProse` / `renderStepTemplate`.

  The export list is now grouped by who imports it — writing a step, driving a browser, reporting a run — rather than by the order the exports were added.

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

- 61b9bf8: Type a scenario actor's `invoke` over the project's exposed RPC map, and give a step the environment it targets.

  `ScenarioActor` is now generic in the RPC surface it can reach, and the generated `pikku-scenario-actors.gen.ts` binds it to `FlattenedRPCMap` — exactly the `/rpc/:name` surface an HTTP actor can reach. An unknown RPC name or a payload of the wrong shape is a compile error rather than a 400 mid-run, and the result is narrowed instead of `unknown`:

  ```ts
  const listed = await actor.invoke('todos:listTodos', { limit: 5 })
  const todos: string[] = listed.todos
  ```

  `wire.scenarioStep.actor` stops being `any`: `PikkuWire` takes the project's actor registry as a type argument, threaded through the generated function types. The actors file is now written even for an empty registry, so `TypedScenarioActors` is always a resolvable import.

  Alongside it:
  - **`invokeRaw(rpcName, data, { headers })`** on `ScenarioActor`, reporting `{ status, ok, body }` rather than throwing. A refusal is the expected outcome of a permissions or scopes scenario, and `invoke`'s error truncates the body naming which scope was missing. `invoke` is now `invokeRaw` plus a throw on `!ok`. The `headers` option is how a step expresses an identity the actor registry cannot.
  - **`scenarioStep.env`** — `{ apiUrl, appUrl? }`, from `scenarios.environments[<environment>]`. Steps run in the CLI process, where there is no `variables` service, so without this every raw-HTTP step would reach for `process.env`. A run started on a server falls back to its own `API_URL`/`APP_URL`.
  - **`requireActor(scenarioStep)` and `requireScenarioEnv(scenarioStep)`** exported from `@pikku/core/workflow`, replacing the hand-rolled `actorOf(...)` guard each step file was writing. Both name the step and say what to pass.

## 0.12.69

### Patch Changes

- 24252b8: Emit queue meta for workflow-only projects, so per-workflow orchestrator queues actually work.

  Workflows synthesise their own `wf-orchestrator-*` / `wf-step-*` queue meta during
  post-processing, and those entries have no declaring source file. The queue codegen
  bailed early on `queueWorkers.files.size === 0`, so a project that uses workflows but
  hand-declares no `wireQueueWorker` wrote no queue meta at all — and the generated
  bootstrap therefore never imported it.

  With `queue.meta` empty at runtime, `getOrchestratorQueueName()` never found a
  per-workflow queue and every workflow silently fell back to the single shared
  `pikku-workflow-orchestrator` queue. Nothing failed, but the isolation was gone: one
  long-running workflow step head-of-line-blocked every other workflow queued behind it.

  The codegen now gates on the meta alone. `@pikku/core` additionally warns at wiring
  time when workflows are registered but no per-workflow orchestrator queue is present,
  so this degradation can't recur silently.

- e3d4454: Add job groups, so one shared queue can stay fair without splitting into one
  queue per producer.

  A job may now carry `group: { id, tier }`, and a worker may cap how many jobs
  of any one group run at once via `groupConcurrency`. On pg-boss this maps to
  `localGroupConcurrency`, which excludes at-capacity groups from the fetch query
  itself, so a capped group costs nothing rather than being fetched and restored.
  BullMQ declares it unsupported (groups are a BullMQ Pro feature) — being
  push-based, it can simply use a queue per group at no polling cost.

  Workflow services accept a `queueStrategy`. The default `'per-workflow'` is
  unchanged: every workflow gets its own `wf-orchestrator-*` / `wf-step-*` queue,
  which is also what lets serverless providers deploy one unit per workflow. The
  new `'shared-groups'` routes every workflow through the shared
  orchestrator/step-worker queues and isolates them by group instead, so a
  monolith runs one set of pollers rather than one per workflow — on a
  pull-based backend with dozens of workflows that is the difference between
  hundreds of poll loops and twenty. It is for single-process runtimes only; a
  per-unit serverless deploy still needs the per-workflow queues to route to its
  units.

## 0.12.68

### Patch Changes

- f11675f: Forward the parent run's `context` into delegated sub-agent invocations.

  A supervisor agent's injected `context` (the "Current context" block holding the
  authoritative identifiers — organizationId, project/stage ids) was appended only
  to the supervisor's own instructions. When it delegated, the sub-agent tool's
  input schema carries just `{ message, session }`, and `buildToolDefs` invoked the
  sub-agent with `{ message, threadId, resourceId }` — dropping the context. The
  sub-agent therefore never saw the real ids and depended on the model re-typing
  them into the free-text `message`, which weaker models routinely botch, producing
  schema-validation and permission rejections that the agent then retries — burning
  steps and ballooning the transcript.

  `buildToolDefs` now takes the parent `context` and forwards it (via the new
  `buildSubAgentRunInput` helper) into both the streaming and non-streaming
  sub-agent invocations, so a specialist inherits the same identifier block in its
  instructions.

## 0.12.67

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

## 0.12.66

### Patch Changes

- 5f19016: Widen the generated agent HTTP surface, and guard attachment downloads against SSRF.

  `agentCaller` and `agentStreamCaller` declared only `message`, `threadId` and
  `resourceId` (plus `context` on the stream route), so `attachments`, `model`,
  `temperature` — all accepted by `AIAgentInput` — were unreachable over the
  shipped HTTP contract. No deployed app could send an attachment or a per-request
  model override. Both callers now share an `AgentCallerInput` type covering every
  optional field and forward each one to the RPC.

  Both callers declare that shape **inline** in the generic position rather than
  behind a shared named alias: the schema extractor only reads type literals there
  and synthesises the schema name from the function name. Behind an alias it
  records an `inputSchemaName` with no schema generated for it, and every agent
  HTTP call then fails at runtime with `MissingSchemaError`.

  Widening that surface makes caller-supplied attachment URLs reachable, which is
  an SSRF vector: the AI SDK downloads attachment URLs **server-side** whenever the
  model cannot consume them natively, using an unguarded `fetch`. A caller could
  point an attachment at the cloud metadata endpoint or another internal host and
  have the response relayed into the model's context. `VercelAIAgentRunner` now
  passes an `experimental_download` implementation backed by `safeFetch` (which
  refuses private/internal hosts and non-HTTP schemes, and re-validates every
  redirect hop) to both `streamText` and `generateText`. URLs the model supports
  natively are passed through untouched, so the provider still fetches those
  itself.

  The runner takes an optional `allowedAttachmentHosts` allowlist, carried across
  `withApiKey`. `safeFetch` is now exported from `@pikku/core/safe-fetch`.

- 78e4778: Stop a failed message persist during an agent stream from killing the process.

  The persisting channel flushes from inside `send`, which is synchronous and so cannot await the flush. Any rejection — a dropped storage connection, or a model reusing a `toolCallId`, which is a primary key in AI storage — escaped as an unhandled rejection and took the whole server down. Persistence from `send` is now best-effort and logged; the awaited `flush()` on the suspend paths still surfaces failures to its caller.

- 4324652: Scope AI agent thread reads to the calling session.

  The generated thread-management functions (`getAgentThreads`,
  `getAgentThreadMessages`, `getAgentThreadRuns`, `deleteAgentThread`) keyed purely
  off a caller-supplied `threadId` and treated `resourceId` as an optional filter,
  so omitting it enumerated every tenant's threads.
  - `listThreads` gains an `owners` **authorization constraint** (distinct from the
    `resourceId` filter): an empty array matches nothing, and it is always derived
    from the session, never from input. Implemented across the Kysely, Redis and
    MongoDB agent run services, with LIKE/regex metacharacter escaping so an owner
    id containing `_` or `%` cannot match a foreign owner.
  - The three `threadId`-keyed functions are now guarded by an `isThreadOwner`
    `pikkuPermission` rather than an in-body check. A thread that does not exist is
    denied rather than 404'd, so it is indistinguishable from one owned by someone
    else.
  - New `@pikku/core/ai-agent` helpers: `canAccessThread`, `threadOwnerConstraint`,
    `sessionPrincipals`, `isOwnedByPrincipal`.

  Services destructured by a wired function are now non-optional inside it.

  The inspector already aggregated the services used by every wired `func`,
  `permissions` and `middleware` into `RequiredSingletonServices`, but the
  generated function types defaulted their service parameter to the raw `Services`
  — so a service declared `foo?: Foo` still arrived as possibly-undefined, forcing
  `if (!foo) throw new MissingServiceError(...)` guards that could never fire.
  Generated types now expose `WiredSingletonServices` / `WiredServices`
  (`RequiredSingletonServices & Services`) and default the `RequiredServices`
  generic of functions, permissions, middleware, auth and approval-description
  helpers to them. Optionality now means only what it should: "this service may
  not be created, because nothing uses it".

- de044f8: Fix the agent tool-list permission filter failing open.

  `buildToolDefs` filtered permission-gated tools by resolving `checkAuthPermissions` from a function's _metadata_ — a by-name lookup into the `misc/permissions` state that nothing ever populates. It therefore collected no predicate and returned `true`, so every auth-gated tool was offered to the model regardless of session (its input schema and description leaked, and the model could attempt calls that then failed at invocation).

  `checkAuthPermissions` now takes the live `CorePermissionGroup` from the function/agent config, where the `pikkuAuth` brand actually survives — matching how the agent's own gate and the function runner already resolve permissions by reference. The dead by-name lookup (`getPermissionByName`) is removed. Enforcement on invocation was never affected; this closes the exposure gap in the offered tool list.

- cd1a811: warn instead of silently ignoring unknown long CLI options

  An unknown long option (`--sektion functions` or `--sektion=functions`) was parsed
  into the options object and then silently dropped by the command's input schema —
  the command ran with the real option at its default and produced plausible-but-wrong
  output. Unknown long options are still accepted (forward compatibility is preserved),
  but the parser now records a warning that the runner prints to stderr, e.g.
  `Warning: Unknown option: --sektion (ignored) Did you mean --section?`.

- 19fa6f0: Fix `HTTPRouteConfig` and `HTTPRoutesGroupConfig`'s default `PikkuPermission`/`PikkuMiddleware` type parameters under-specifying their own generic arguments (e.g. `CorePikkuPermission<any>` instead of `CorePikkuPermission<any, any, any>`). The missing arguments silently fell back to `CorePikkuPermission`'s own defaults (`CoreServices`, with `schema` optional) instead of `any`, so a project whose generated services type guarantees `schema` is always present (any project using `WiredServices`-style non-optional services) failed to type-check against `defineHTTPRoutes`/`wireHTTPRoutes` with a misleading `index signature` error.
- b501612: Enforce authorization consistently across `pikku*` primitives.
  - `pikkuAIAgent` now enforces `permissions` (previously accepted but never
    checked) and gains `auth` and `scopes`. Scopes are checked before permissions.
    `auth` defaults to `false`, matching `pikkuSessionlessFunc`, since agents are
    typically invoked from an already-authenticated function or from sessionless
    contexts such as crons and queue workers.
  - `pikkuWorkflowFunc` / `pikkuWorkflowComplexFunc` schema config gains `auth`
    and `scopes` alongside `permissions`.
  - `pikkuScenario` no longer accepts `auth`, `scopes`, or `permissions` —
    scenarios drive the app as actors and authorize per step.
  - `wireGateway` no longer accepts `permissions`. A gateway proxies to an agent,
    so access is governed by normal auth plus the target agent's own rules.
  - Removed the dead `permissions` field from `CoreWorkflow`, which was never read.

  Closed two paths that reached user code without authorization:
  - Gateway handlers were invoked directly, so a handler's own `auth`, `scopes`
    and `permissions` were never evaluated. Webhook, websocket and listener
    gateways now invoke the handler through the function runner. Handlers are
    sessionless by default (inbound gateway traffic is platform-authenticated by
    the adapter, not session-bearing); declare `auth: true` to require a session.
    A gateway's own `auth` field is now honoured too — it was previously ignored.
    Gateway middleware runs before the gate, so `wire.setSession()` in gateway
    middleware — the idiomatic way to map a verified platform sender to a user —
    is visible to the handler's `auth` and `scopes`.
  - Resuming a suspended agent run (`resumeAIAgentSync`, `resumeAIAgent`) checked
    run ownership but never re-ran the agent's own gate, so a scope or permission
    revoked while a run was suspended did not prevent the caller from resuming it
    and approving its pending tool calls. Both now re-run `assertAgentAuthorized`
    before any state is mutated.

- eb37b1e: Fix `voiceInput` middleware losing the runner receiver: it grabbed
  `aiAgentRunner.transcribe` as a bare method reference, so calling it left `this`
  undefined and threw `Cannot read properties of undefined (reading 'getModel')`
  on the first audio attachment. It now calls `aiAgentRunner.transcribe(...)`
  directly, preserving the receiver.

## 0.12.65

### Patch Changes

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

- 1a86d3f: Stop silently dropping switch cases and spread returns from workflow graphs.
  - A fall-through case (`case 'a': case 'b': ...`) recorded only the last value.
    A run entering on `'a'` therefore appeared to match no case at all. Empty
    clauses now carry through to the entry they fall into — the next non-empty
    case, otherwise `default`, otherwise the switch exit.
  - `return { ...r, extra: 1 }` produced a return node listing only `extra`, so
    the graph claimed an output shape the workflow does not have, with no
    diagnostic. `return r` produced no return node at all. `ReturnStepMeta` now
    records a `spread` list, and the regenerated code emits it.

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
- 3d76f51: Add an optional `docsUrl` to `wireSecret`, `wireVariable`, and `wireCredential`, so a console or deploy UI reporting a missing value can link the user to where they obtain it instead of showing a bare identifier.

## 0.12.64

### Patch Changes

- 7ab5287: Security hardening (follow-up to the #966 C1/C3 fixes):
  - SSRF (C1): `isPrivateHost` now also rejects alias/encoded forms that resolve to internal targets — trailing-dot FQDNs (`localhost.`), the reserved `*.localhost` name, IPv4-mapped IPv6 (`::ffff:127.0.0.1`), octal/decimal/hex-encoded IPv4 (`0177.0.0.1`, `2130706433`, `0x7f000001`), and the full `fe80::/10` link-local range. `safeFetch` also strips `Authorization` and `Cookie` headers whenever a redirect crosses origin so credentials cannot leak to a redirected host.
  - Forgeable approval markers (C3): the sub-agent approval marker is now identified by a non-forgeable `Symbol` brand set only by framework code, instead of the plain `__approvalRequired` string key. A delegating tool's LLM-shaped `result.object` (plain JSON) can no longer conjure an approval/suspension even though the tool is allowed to forward approvals.

- e86bc17: Security + feature: bind AI agent thread/run ownership to the authenticated session and add `sessionScope: 'user' | 'org'` to agents. The owner key is now the trusted principal (`session.userId`, or `session.orgId` for org-scoped agents) composed with the client `resourceId` (`principal:resourceId`), so a client-supplied `resourceId` sub-partitions within the caller's own boundary but can never widen access to another user's or org's threads. Resolution is idempotent (safe for sub-agent recursion and resume); org scope with no session org is denied; sessionless `user` wirings fall back to the bare `resourceId`.
- a9b96a0: Security: only honor the `__approvalRequired` suspension marker from framework sub-agent tools (`forwardsApproval`), so an attacker-influenced ordinary tool result can no longer forge an approval/suspension.
- 3f7fc54: Security: SSRF-harden outgoing webhook delivery and voice-input audio fetch (validate scheme + block private/internal hosts, re-validate every redirect hop via a shared `safeFetch`); stop the channel stream-middleware cache from reusing an earlier run's per-invocation middleware closures across runs.
- c478794: Simplify authorization to be session + function based (#972). Permissions are now function-scoped only: global permissions AND together, a function's own permissions OR together, and the two are independent gates that both must pass — a broad global can no longer satisfy an admin-only function. Removed wire-, tag-, and HTTP-route-level permissions (`addTagPermission`, `addHTTPPermission`, wire-level `permissions` on HTTP/channel/MCP wirings). Tags are now organizational only. `auth` (session presence) and tag/HTTP middleware are unchanged.
- 3f04ae4: Fix `pikku dev` hot-reload memory leak (#975). Changed user files were re-imported under a fresh URL on every reload (a `data:` URL on Node, a uniquely-named temp sibling on Bun), which permanently leaked a record in the native ESM loader map — the dev server climbed to `JavaScript heap out of memory` during long editing sessions (worse on Bun, which the sandbox dev server runs on). Reloading now goes through an evictable module runner that transpiles the source and runs it via `vm.compileFunction`, holding exports under a stable path key so each edit overwrites one slot and the previous module is collected. Heap stays bounded on both runtimes.
- 90d9f04: Scope `console:getAddonInstalledPackage` to the addon's own `.pikku` metadata.

  Previously every addon returned the _app's_ secrets/wirings (read from the app's
  `.pikku` root), so the installed-package view couldn't show what a given addon
  actually requires. `MetaService` gains optional `readPackageFile`/`readPackageDir`
  helpers (implemented by `LocalMetaService`, which resolves the addon package's
  root from node_modules), and `getAddonInstalledPackage` now reads secrets,
  variables, wirings, schemas, README and package.json from the addon package
  itself. It also reads and returns the addon's `credentials` meta (OAuth2 + wire
  credentials), which was never surfaced before — entries with an `oauth2` field
  are the OAuth integrations to connect.

- cb079cc: A workflow-graph node's `func` can now reference a registered AI agent by name, dispatched as an agent run like sub-workflows, with `ref()` resolving the agent's output keys.
- cb079cc: `pikkuAIAgent` gains a `workflows: []` capability: a referenced workflow is exposed to the LLM as a tool that runs inline and returns its output.
- 0a7db82: AI agent tool `execute()` failures are now logged via `logger.error` unconditionally (then rethrown), instead of only surfacing when a tool-call middleware hook is registered.
- 981c4db: Add a model-baked `AIEmbeddingService` interface and optional `aiEmbedding` slot on `CoreSingletonServices`, with separate `embedDocuments`/`embedQuery` methods for vector-store addons.
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

- 5a2b0d5: Prune removed addons on `pikku dev` hot-reload. Deleting an addon wiring (`*.addon.ts`) regenerated `.pikku` on disk but left its `wireAddon` entry stranded in the live `pikkuState(null,'addons','packages')` map until a full restart (the reimport path is add-only), so `getInstalledAddons` kept reporting deleted addons. `reloadGeneratedMeta`'s sibling `reconcileAddonRegistry(declaredNamespaces)` now drops any addon namespace the fresh inspection no longer declares, and the dev watcher calls it with `inspectorState.rpc.wireAddonDeclarations`. Routes already reconcile (http meta is replaced wholesale + router reset); function-impl entries are intentionally left since the workflow service registers framework internals there that aren't in the generated set.
- 13474a6: feat(scopes): grant scopes directly to a user, not only through roles

  A scope can now be granted to a user directly, outside of any role.
  `resolveScopes` returns the union of a user's role-derived scopes and their
  direct grants, so a one-off capability no longer requires inventing a role.
  - `@pikku/core`: `ScopeService` gains `addScopeToUser` / `removeScopeFromUser` /
    `listUserScopes`.
  - `@pikku/kysely`: a new `pikku_user_scope` table (FK into `pikku_scopes`, so the
    database still refuses an undeclared grant; `ON DELETE CASCADE` from `user`,
    so deleting a user takes their direct grants with it). `resolveScopes` unions
    it with the role join.
  - `@pikku/addon-console`: `scopeAddScopeToUser` / `scopeRemoveScopeFromUser`
    (gated by `pikku:scopes:manage`), and `scopeListUserRoles` now also returns
    `directScopes`.
  - `@pikku/console`: a **Direct scopes** section in the user roles drawer to grant
    and revoke scopes directly, showing them distinctly from the resolved union.

  Also: the Scopes page now distinguishes a permission error (a console admin
  without `pikku:scopes:read`) from an actual scope-service outage, instead of
  showing "the scope service may be unavailable" for both.

- ee040dc: fix(ai-agent): resolve addon-scoped services when generating a tool's approval description. The `approvalDescription` for an addon function ran against a cold per-package services cache and silently fell back to root services, so descriptions reading addon-only services (e.g. a todo store) threw and the approval `reason` never reached the client. It now builds the addon's singleton services the same way the tool's `execute` path does (#971).
- cb079cc: `pikkuWorkflowGraph` nodes accept an optional `notes?: string` and the graph an optional `notes?: string[]`; notes are documentation only and excluded from `graphHash`.
- 13474a6: feat: ScopeService.listScopes

  Exposes the scope vocabulary held in the store — everything a role can be
  composed from — flagging any scope that is still present but no longer declared
  in code (inert, and awaiting `pikku scopes prune`).

- 9f0d0eb: Migrate the `--oauth` addon scaffold off `OAuth2Client`. A scaffolded OAuth2
  addon service used to construct `new OAuth2Client(config, appCredentialSecretId,
secrets)` and do its own token exchange/refresh — the responsibility better-auth
  now owns via the credential service. The `pikku new addon --oauth` scaffold (and
  the OpenAPI `--openapi` generator) now emit a service that receives a ready
  access token: `services.ts` uses `createWireServices` + `wire.getCredential<{
accessToken: string }>(name)` and the service does a plain `fetch` with
  `Authorization: Bearer ${accessToken}`, matching the existing per-user
  bearer/apikey credential scaffold. With no remaining consumers, `OAuth2Client`
  (`@pikku/core/oauth2`) and its test are removed; the `./oauth2` export keeps the
  `OAuth2AppCredential` / `OAuth2Token` types.
- 13474a6: Add scopes: declared, statically-checked authorization scopes on pikkuFunc.

  A scope is a capability string the session must hold. Unlike `permissions` —
  which OR together across global/wire/tag/function levels — scopes are an AND
  gate that runs before them, so adding one can only ever narrow access.

  ```ts
  wireScope({
    admin: {
      scopes: { invoices: { scopes: { create: {} } } },
    },
  })

  export const createInvoice = pikkuFunc({
    scopes: ['admin:invoices:create'],
    func: async (services, data) => { ... },
  })
  ```

  The gate runs after the auth check and before the request body is evaluated,
  since scopes depend only on the session. A session lacking a required scope
  gets a `MissingScopeError` (403) naming it. Wildcards grant subtrees:
  `admin:*` satisfies `admin` and `admin:invoices:create`.

  `session.scopes` is populated by whoever builds the session — core reads it and
  never fetches, keeping the runner free of I/O. The new `ScopeService` interface
  resolves scopes at the session boundary.

- 70fa400: Add outgoing webhooks — `webhookService.send()` enqueues signed deliveries onto a retrying queue, `@pikku/kysely`'s `KyselyWebhookService` persists per-attempt delivery history, and `@pikku/console` gains a read-only `/webhooks` page; also caches resolved secrets in `TypedSecretService` and registers inline-`func` metadata for queue/scheduler/trigger/gateway wirings.
- 7b2ea23: `wireAddon` can install one addon package as multiple named instances, each with its own per-instance singleton services and `secretOverrides`/`variableOverrides`/`credentialOverrides` that alias logical names to real project secrets/variables/credentials.
- 1dc77d5: Remove the old, pre-better-auth OAuth2 credential runtime now that the
  `credentialOAuth` plugin owns credential linking, storage and refresh.
  - `@pikku/core`: drop the unused `createOAuth2Handler` HTTP-routes flow (and its
    `CreateOAuth2HandlerOptions`) from the `./oauth2` entrypoint. The credential
    schema types (`OAuth2AppCredential`, `OAuth2Token`) and the `OAuth2Client`
    API helper remain exported.
  - `@pikku/addon-console`: delete the six `oauth-*` console functions
    (connect/disconnect/status/exchange-tokens/refresh-token/test-token) and the
    `OAuthService` behind them — credential connections now flow through
    better-auth's `/credential-oauth/link` + `/callback`.
  - `@pikku/console`: the credential UI no longer calls the removed
    `console:oauth*` RPCs. Per-user and singleton (platform) OAuth2 credentials
    connect via the `/credential-oauth/link` full-page redirect and disconnect via
    `console:credentialDelete`; the `/oauth/callback` popup page is removed.

- 416606c: Fix a TypeScript 6 `PikkuWire` constraint collapse that made `rpc` a required field: narrow `PikkuRPC` default type params from `any` to `Function` and replace bare `any` TypedRPC args with `PikkuRPC`.
- d2a6eea: Add `wireRemoteAddon` — consume a hosted addon's `remote: true` RPCs transparently over HTTP, with the addon installed as a devDependency (types only). `rpc('ns:fn', input)` dispatches to the host's `/remote/rpc/:rpcName`, authenticating as a client with a token bound from a local source (`{ credentialId }` per-user, `{ secretId }` platform, or a custom `resolve()`), or omitted for a public surface. This is any-machine → hosted-library client auth, distinct from the trusted mesh (`PIKKU_REMOTE_SECRET`). A new `.remote.gen.d.ts` RPC map exposes only the `remote: true` surface to consumers. `pikku` verify errors if a `wireRemoteAddon` package is a production dependency (or missing) instead of a devDependency, and if a bound `credentialId`/`secretId` isn't wired.
- 30e62ee: Add `workflow.approval(reason, { schema, expiry })` — a return-valued, expiring human-in-the-loop gate that stays closed until a decision is recorded (via `workflowService.approveStep` or `POST /workflow/:workflowName/approve/:runId`), unlike the one-shot `workflow.suspend()`.

## 0.12.63

### Patch Changes

- ae65588: `fetchData` now defaults `exposeErrors` to `!isProduction()`, so a non-production HTTP server returns the error `message` and `stack` on unexpected 500s instead of a bare `{ errorId }`. A dev/sandbox RPC that 500s is now debuggable from the response alone; production (NODE_ENV=production) still returns only the errorId.

## 0.12.62

### Patch Changes

- b226948: Scenario context: scenarios now receive a `scenario` wire (was `workflow`) with the scenario-only helpers `expectEventually`/`expectError`/`expectService` plus a new `scenario.runScheduledTask(name)` that fires a cron inline with the system session. `PikkuWorkflowWire` is trimmed to the plain DSL (`do`/`sleep`/`suspend`); the scenario surface lives on the new `PikkuScenarioWire`. Actor calls (`invoke`/`converse`) stay on the `actors` registry. Scenarios are now excluded from `pikku scenario --coverage` totals.

## 0.12.61

### Patch Changes

- 982d3f5: Webhook gateway routes are now fully compiled instead of runtime-registered. The inspector projects `wireGateway` into the generated HTTP and function meta (deterministic `gateway__<name>__post`/`__verify` ids), and the gateway runner no longer mutates meta state at runtime — it only registers the handler implementations at module load, like every other wire. Previously the runtime-only meta was invisible to codegen and the dev-server meta reload wiped it, 500ing every gateway request.

  Also fixes the GET verification echo: string challenges return as a raw body (platforms compare byte-for-byte; the old JSON quoting failed Meta's check), object responses stay JSON, and failed verification now throws `UnauthorizedError` (401) instead of returning 200 with an error body.

## 0.12.60

### Patch Changes

- a3a49f2: fix(workflow): carry `pikkuUserId` onto queued workflow step wires so authed steps rehydrate their session

  A workflow step invoked on the queued (pg-boss) executor received the bare job wire (payload is just `{ runId }`), so `pikkuUserId` was never on the step wire and an authed step (`pikkuFunc`) threw `Authentication required` — even though the run wire persisted the acting user's id and the inline executor worked. `invokeStepRpc` now reads `pikkuUserId` from the persisted run wire and merges it into the step wire override, so authed steps rehydrate their session via the `SessionStore` on both the inline and queued paths.

## 0.12.59

### Patch Changes

- 1f3f510: Warn when a Pikku function body performs a runtime dynamic `import(...)`.

  The inspector now flags any `pikkuFunc`/`pikkuSessionlessFunc` (and friends) whose handler body contains a dynamic `import(...)` call — including nested callbacks — with the new `PKU498` diagnostic. Function bodies run on every invocation, so a dynamic import there adds per-call latency and defeats bundling/tree-shaking; the import belongs at the top of the module or in your services/`wireServices` setup instead.

  Type-only positions like `import('x').Foo` are not flagged. The rule defaults to `warn` — a printed yellow warning that does not fail the build — and is configurable via `lint.functionDynamicImport` in `pikku.config.json` (`'off'` to silence, `'error'` to make it a hard build failure), matching the existing `servicesNotDestructured`/`wiresNotDestructured` lints.

## 0.12.58

### Patch Changes

- 7b17b14: Allow a workflow-graph node's `func` to reference a registered AI agent by name, dispatched as an agent run — exactly like sub-workflows. `executeGraphStep`/`executeGraphNodeInline` now check the agent registry and dispatch matching nodes via the agent-run path (`rpc.agent.run`), so the node's result is the agent's declared output and downstream nodes can `ref()` it. The generated `pikkuWorkflowGraph` wrapper widens its node-func union to also accept `keyof FlattenedWorkflowMap` and `keyof FlattenedAgentMap`, and `ref()` resolves an agent node's output keys.
- daec082: Drop Node 22 support — the minimum supported runtime is now Node 24 (LTS).

  Node 22 deadlocks `pikku dev` at `loadUserBootstrap` (tsx `register()` + `require(esm)` cycle handling on node 22.12+), and Node 20 is already below our floor. The `engines.node` requirement is raised to `>=24` across all packages, matching `.nvmrc` and the CI test matrix. Closes #751.

- e0fd352: wireGateway: allow `adapter` to be a factory `(services) => GatewayAdapter | Promise<GatewayAdapter>`, resolved lazily on first inbound request (webhook/websocket) or gateway start (listener) and cached. Real platform adapters (WhatsApp Cloud API, Slack) need secrets that only exist after boot, while wireGateway runs at module load — a factory bridges that. Factory adapters register the GET verify route unconditionally since verifyWebhook can't be probed before first resolve.

## 0.12.57

### Patch Changes

- 60ad8cb: fix dev-server hot reload so edited AND new functions/routes apply without a restart
  - `@pikku/core`: the hot reloader fed raw zod `input`/`output` schemas into the JSON-schema map, so `compileAllSchemas` threw `Failed to compile schema` on every reload and the reload aborted (only the function body sometimes swapped, half-updated). It now registers function implementations only and leaves schemas to the codegen JSON output. New function exports are registered too (previously only already-registered names were replaced). Reloads write into the startup functions map directly to avoid a race with the dev watcher's codegen-scoped state swap, and re-import via a uniquely-named sibling copy since neither Bun nor tsx bust the module cache on a `?t=` query.
  - New `reloadGeneratedMeta` (exported from `@pikku/core/dev`) re-reads the regenerated wiring meta + JSON schemas into the running process so new/changed routes, RPCs, queues and agents resolve without a restart.
  - `@pikku/cli`: `pikku dev` now calls `reloadGeneratedMeta` after each watch-triggered codegen pass and re-imports the changed files once fresh meta is in state, so a NEW route in a changed wiring file registers (its `wireHTTP` no longer no-ops on missing meta).
  - `@pikku/schema-cfworker`: `compileSchema` recompiles when a schema's value changes (not only on first sight), so hot-reloaded schemas take effect.

- 8f5c998: Fix dev hot-reload dropping runtime-registered function/queue meta. `reloadGeneratedMeta` replaced the whole `function`/`queue` meta maps with the generated JSON, wiping entries the framework registers at service-init (the workflow orchestrator, per-workflow queue workers, and other `addFunction`'d internals that never appear in the generated files). Workflow jobs then failed with `Function meta not found: pikkuWorkflowOrchestrator`. The reload now merges over the existing maps so those internals survive.

## 0.12.56

### Patch Changes

- 6c30861: fix workflow step retry backoff firing immediately
  - `@pikku/queue-pg-boss`: `backoff: 'exponential'` mapped to `retryBackoff: true` without a base `retryDelay`; pg-boss computes exponential backoff as `retry_delay * 2^n` with a queue default of 0, so every retry fired immediately. Exponential backoff now gets a 1s base delay, and sub-second fixed delays round up to 1s instead of flooring to 0 (= immediate).
  - `@pikku/core`: a duration-string `retryDelay` (e.g. `'15s'`) on a workflow step was silently dropped (only numbers were honored) and fell back to exponential. It now resolves to a fixed backoff via `getDurationInMilliseconds`.

## 0.12.55

### Patch Changes

- bcfebf6: Console: accept `Authorization: Bearer <PIKKU_CONSOLE_TOKEN>`

  A console served from another origin cannot carry the session cookie, so
  every `console:*` RPC returned 403. `authBearer` gains a secret-resolved
  token mode (`token: { secretId, userSession }` — resolved through the
  secrets service per request, constant-time compare, no-op while the secret
  is unset), and the auth scaffold wires it with `PIKKU_CONSOLE_TOKEN` when
  `scaffold.console` is enabled — inside the same `addHTTPMiddleware('*')`
  call as the session middleware, since the inspector keys route-middleware
  groups by pattern (pikkujs/pikku#886).
  Set that secret in the server environment and send it as a bearer token to
  authenticate an external console.

## 0.12.54

### Patch Changes

- ded4f90: `pikku scenario --coverage` no longer requires the console addon

  The scenario instrumentation RPCs (take/reset live coverage, reset stubs, get
  stub calls) previously shipped inside the console addon, so any project
  without the addon silently lost scenario coverage and stub assertions — and
  core's `expectService` hardcoded a `console:` RPC, assuming an addon was
  installed.

  A new `scaffold.scenarios` feature (`pikku enable scenarios`, or
  `"scaffold": { "scenarios": "auth" }` in pikku.config.json) generates the
  four functions into the project scaffold as `pikkuScenario*` exposed RPCs.
  The scenario runner and `expectService` now invoke those names and the
  addon copies were removed. The source-map-aware coverage mapping (and its
  `@jridgewell/trace-mapping` dependency) moved from the addon into the CLI:
  `@pikku/core` gains only the report types plus an optional
  `CoverageService.takeReport`, which the CLI-booted coverage service
  implements and the scaffolded function calls.

## 0.12.53

### Patch Changes

- efb0406: Add in-process V8 precise coverage (`pikku dev --coverage` / `pikku serve --coverage`) with per-scenario attribution.
  - `@pikku/core`: new `V8CoverageService` (node:inspector precise coverage with snapshot + reset), exposed as the optional `coverageService` singleton service.
  - `@pikku/inspector`: function meta now records `bodyStart`/`bodyEnd` body spans (verbose meta only) so coverage can be mapped without a runtime TypeScript dependency.
  - `@pikku/cli`: `--coverage` on `pikku dev` and `pikku serve` starts the collector in-process; `pikku scenario run --coverage` resets/snapshots the server between flows and writes `.pikku/coverage/scenario-coverage.json` with per-scenario function coverage.
  - `@pikku/addon-console`: new exposed `takeLiveCoverage` / `resetLiveCoverage` RPCs; V8 ranges are mapped through inline source maps to original TypeScript lines (offset-based, so esbuild/tsx single-line output keeps full resolution).

- fe4f5ca: Add `stub`/`spy`/`isTestRun` core utils with call recording for scenario assertions.
  - `@pikku/core`: `StubTracker` moves here from `@pikku/cucumber` (which re-exports it), gaining `record`/`getCalls`/`reset`. New plain-import utils backed by a process-wide tracker: `stub(name, impl?)` (recording fake), `spy(name, real)` (record + pass through), `isTestRun()` (reads `PIKKU_TEST_RUN`). Nothing is injected into service factories and no new factory types exist — swap services with a plain `isTestRun()` conditional where needed. New scenario DSL steps: `workflow.expectService('email.send', { calledWith })` asserts recorded stub calls via the console RPC, `workflow.expectError(...)` walks error branches.
  - `@pikku/cli`: `pikku dev --test` sets `PIKKU_TEST_RUN` and wraps the dev-provided default services (email) in recording spies; independent of `--coverage`, absent from production `pikku serve`. `pikku scenario run` resets recorded calls per flow.
  - `@pikku/addon-console`: exposed `getStubCalls` / `resetStubs` RPCs next to the coverage snapshot endpoints.

## 0.12.52

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

- f1f39f8: Bound the actor-flow approval loop (#850)

  `converseWithTarget` now caps suspend→approve rounds within a single target turn
  (default 16, override via `maxApprovalRounds`). A cooperative target completes
  after a handful of rounds; a buggy or uncooperative one — e.g. re-requesting a
  tool the persona keeps denying — previously could spin the inner loop forever
  without ever spending a `maxTurns` credit. Exceeding the cap now throws instead
  of hanging.

- c45e98d: Run user flows from the console, actors and all (#850)

  Starting a `user-flow` workflow without explicit run actors (as the console's
  Run button does) now auto-builds HTTP actors from `USER_FLOW_ACTOR_SECRET` and
  `API_URL`: each actor signs in via the actor auth plugin — which mints the
  `actor: true` user row on first sign-in — and drives its steps over HTTP as
  that persona. When the secret or API base URL isn't configured the run simply
  proceeds without actors (with a warning) instead of failing.

  The workflow-detail view also gains the shared console header: the workflow
  selector and the "complex workflow" note now live in the header bar, the right
  details panel hides when it has nothing to show, and step nodes display their
  DSL labels (e.g. `Double ${item}`).

- 472a349: Rename the userflow concept to scenario (#862). `pikkuUserFlow` becomes `pikkuScenario`, `pikku userflow run/list` becomes `pikku scenario run/list`, the workflow meta flag `userFlow` becomes `scenario`, actor types are now `ScenarioActor`/`ScenarioActors`/`ScenarioActorConfig` (`createHttpScenarioActors`), pikku.config.json's `userFlows` key becomes `scenarios`, the generated actors file is `pikku-scenario-actors.gen.ts` (`createScenarioActors`), the actor sign-in secret env var is `SCENARIO_ACTOR_SECRET`, and the console's User Flows view is now Scenarios.

## 0.12.51

### Patch Changes

- 7ebea62: Tree-shake addon registrations in filtered inspector states (per-unit deploy codegen).
  - `filterInspectorState` drops an addon's `wireAddonDeclarations`/`usedAddons` unless something kept actually references it (kept wiring targeting `namespace:*`, kept agent/MCP tool, or a body-level `rpc.invoke('namespace:*')` from a file that still contains a kept function). The generated per-unit bootstrap no longer imports unused addon package bootstraps — previously every deploy unit registered every addon's entire function surface, which pulled dev-only code (e.g. `@pikku/addon-console`'s static `node:fs` imports) into Cloudflare Worker bundles and failed upload with `No such module "node:fs"`.
  - Body-level `rpc.invoke()` targets are now tracked per source file (`rpc.invokedFunctionsByFile`) so wiring-level `ref()` targets no longer pin an addon into every unit.
  - `aggregateRequiredServices` computes addon parent services per used addon function (from the addon's shipped per-function `services` meta) instead of blanket-adding `addonRequiredParentServices` — and matches namespaced ids only, so bare project function names colliding with addon function names no longer force the blanket.
  - Addon builds keep per-function `services` in the shipped `pikku-functions-meta.gen.json` so parent projects can do the above; addons built before this fall back to the blanket.
  - HTTP route meta records `refTarget` for `ref('namespace:fn')`-wired routes, so per-unit filtering keeps the addon registration (and only that function's services) when the route deploys.

- e57dd65: feat(console): surface the `pikku audit` report in the dev console

  Adds a view-only **Security** screen to the pikku dev console that renders the
  dependency audit produced by `pikku audit` (`.pikku/audit.json`): known
  vulnerabilities (severity, advisory, recommended version) and available
  dependency updates.
  - `@pikku/core`: exports the canonical `SecurityAuditReport` artifact type (plus
    `SecurityAuditIssue`/`SecurityAuditUpdate`/`SecurityAuditSummary` and the
    `SecuritySeverity`/`SecurityUpdateLevel` unions) — a single source of truth
    shared by the CLI (writer), the console addon (reader) and the console UI.
  - `@pikku/addon-console`: `getSecurityAudit` reads the audit artifact via the
    meta service; `runSecurityAudit` triggers `pikku audit --outdated` server-side
    (regenerating the artifact) — same shape as the Run Tests action;
    `updateDependency` bumps a package in `package.json` (preserving the `^`/`~`
    range), runs `bun install`, re-audits, and returns the fresh report.
  - `@pikku/console`: new `SecurityPage` with a **Run audit** button + reusable
    presentational `SecurityAuditView` (exported, so downstream consoles can wrap
    it with their own actions) + `useSecurityAudit`/`useRunSecurityAudit`/
    `useUpdateDependency` hooks. Issues/Dependencies lenses; per-finding
    remediation slot right-aligned in the row header (`renderRemediation`,
    defaulting to the OSS `UpdateDependencyButton`; Fabric swaps in its own
    sandbox-verified action). Empty state until an audit has been run.

## 0.12.50

### Patch Changes

- 35a9bab: UserFlowActor exposes the actor's `email` so flows can use it for
  invites/lookups instead of hardcoding the config value.
- 92bd643: User flows in the console: workflow graph extraction now captures
  `workflow.expectEventually` steps and per-step actor names (`{ actor:
actors.x }`), workflow meta carries `actors`/`title` into the serialized
  graph, the CLI emits `user-flow-actors.gen.json` for the new
  `MetaService.getUserFlowActorsMeta()`, and the console Workflows page gains a
  Workflows / User Flows / Personas toggle. Also fixes complex-workflow graphs
  being clobbered by a duplicate basic-extraction pass after successful DSL
  extraction.

## 0.12.49

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

## 0.12.48

### Patch Changes

- 5f2c566: Better Auth actor plugin for user flows: `actor({ secret })` adds an `actor`
  boolean column on `user` and a `POST /sign-in/actor` endpoint (`{ email,
secret }`, constant-time compare). Actor rows are auto-created on first
  sign-in; a real (non-actor) user can never be impersonated with the secret.
  The flag propagates into the pikku core session (`CoreUserSession.actor`) via
  both `betterAuthSession` and `betterAuthStatelessSession`, so audits and
  analytics can address synthetic traffic.
- 8dfddc3: pikkuUserFlow: user flows as workflows. A complex workflow whose steps can run
  as actors over the real transport — `workflow.do(step, rpc, data, { actor:
actors.yasser })` — plus `workflow.expectEventually(...)` for polling async
  effects. Actor steps never queue and never dispatch internally, so auth
  middleware/permissions are exercised end-to-end; flows double as e2e tests and
  staged/production health checks. Ships UserFlowActor types +
  createHttpUserFlowActors (lazy sign-in via `/auth/sign-in/actor` with a
  server-held secret), inspector source `'user-flow'`, and a console badge.

## 0.12.47

### Patch Changes

- 1cd0b2f: fix audit writes silently dropped on the exposed-RPC path: the auditLog wire service was created once per transport invocation (on the outer wire, e.g. the generated rpcCaller with no audit config), so audited functions invoked via nested rpc inherited a disabled instance. The runner now re-gates auditLog per audited function, binding a fresh invocation audit to the function's own wire (correct functionId/actor attribution) and flushing it when the invocation ends. Dropped-write warnings now fall back to the singleton logger (wires rarely carry one) and name the function, so a dropped audit write is never invisible.

## 0.12.46

### Patch Changes

- d0d97cb: Stop browser bundles pulling the @pikku/core server runtime.

  `@pikku/console` (a browser package) imported pure helpers (`buildRunTimeline`,
  `reconstructStateAt`, `reconstructFinalState`, `generateCommandHelp`) from the
  `@pikku/core/workflow` and `@pikku/core/cli` barrels. Those barrels also
  re-export `PikkuWorkflowService`, `deriveInvocationId` (which imports Node's
  `crypto`), and the queue workers — so importing the pure helpers dragged the
  entire server runtime into the browser bundle.

  Two fixes:
  1. Expose browser-safe subpath exports that contain only pure, type-only-import
     modules — `@pikku/core/workflow/timeline` (run-timeline),
     `@pikku/core/workflow/types` (pure type surface), and
     `@pikku/core/cli/command-parser` — and import from those in `@pikku/console`
     so the server barrels stay out of the browser's live bundle.
  2. Import Node's crypto via the explicit `node:crypto` specifier in the
     server-only `utils/hash.ts` and `wirings/workflow/workflow-invocation-id.ts`
     (both use `createHash`). Bundlers externalize `node:`-prefixed builtins
     instead of routing them through a browser `crypto` alias, so even when the
     workflow service survives in a consumer's graph as tree-shaken dead code
     (its `addError` side-effects), its transitive `createHash` import no longer
     breaks the browser dep optimizer.

## 0.12.45

### Patch Changes

- e9a778f: feat(config): add optional `postgres` pool config to `CoreConfig`

  Postgres is a first-class adapter, so its runtime pool tuning now lives in the
  core config (sibling to `workflow`), typed via the new `PostgresConfig`:
  `maxPool`, `connectTimeout`, `idleTimeout`, `maxLifetime`, `statementTimeout`,
  `prepare`. The connection string itself stays the flat `postgresUrl`/`sqliteDb`
  field the CLI db commands read; this block is purely runtime pool options.

## 0.12.44

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

## 0.12.43

### Patch Changes

- a8022e5: fix(workflow): scope the step advisory lock to the claim, not execution

  `executeWorkflowStep` held the step's advisory lock — and, in the Postgres
  workflow service, the pooled DB connection backing it — across the entire step
  body, including the step's own network and DB work. Under concurrency >= the DB
  pool size this self-deadlocks: every running step pins a connection on its lock
  transaction while its inner queries wait for a connection that never frees, so
  nothing makes progress and the API hangs.

  The lock is only needed to atomically _claim_ a step (read state + mark it
  `running`); once a step is `running`, the existing status guard already prevents
  any concurrent worker from re-running it. The lock now covers only the claim;
  execution and result persistence run with the lock released and the connection
  back in the pool.

## 0.12.42

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

## 0.12.41

### Patch Changes

- 04db6a2: Make `rpc` a required property on `PikkuWire`. It is always lazily initialised by the function runner on every invocation regardless of wire type, so marking it optional was misleading.

## 0.12.40

### Patch Changes

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

## 0.12.39

### Patch Changes

- 4be205f: Dedupe DSL step execution: extract a shared `invokeStepRpc` (step RPC + provenance wire, used by both the queue and inline executors) and a shared `runInlineRetryLoop` (the in-process running→result→retry scaffolding, used by inline RPC steps and inline function steps). No behavior change — the inline path stays straight-through O(K); the queue path keeps its suspend/replay model.
- 061c717: fix(cli): log just the message for expected failures, keep the stack for uncaught errors

  A deliberate, expected failure — e.g. `pikku all` aborting because a build gate
  (blocking diagnostics) tripped — was dumping a full workflow stack trace, burying
  the one line that matters. Errors are now classified: a `PikkuError` (or any error
  carrying an `expected` marker) prints its message alone, while a genuinely uncaught
  error still prints the full stack so it can be debugged.
  - New `isExpectedError(error)` helper (exported from `@pikku/core`): true for a
    `PikkuError` or an error flagged `expected`.
  - The `expected` flag is threaded through `SerializedError` and the in-memory
    workflow step store so it survives the step-boundary rehydration that strips the
    error's class.
  - The CLI runner's top-level catch, the `CLILogger`, and the workflow runner's
    failure log all honour it.
  - The blocking-diagnostics abort now throws a `PikkuError` subclass so it is
    treated as expected.

- 2c55e13: fix(queue): `InMemoryQueueService` redelivers failed jobs up to `options.attempts` with backoff

  Previously the in-memory queue ran each job once and dropped it on failure, so a
  transiently-failing workflow step dispatched via `inline: false` would stall the
  run forever (the orchestrator was never resumed). It now honors the `attempts`
  and `backoff` already produced by the workflow step job options, redelivering on
  failure — matching pg-boss/bullmq semantics so local/dev runs recover from
  transient step failures exactly as production does.

- c745c26: fix(workflow): inline graph runs use the same transition planner as the queue

  `continueGraphInline` had its own, weaker graph traversal that couldn't revisit a
  node (no cycles) and never recorded `fromStepName`, so an inline-run graph stored
  different step state than the same graph run through a queue. It now uses the
  shared `planGraphTransitions` planner — inline graphs get joins, cycle revisits
  (`node`, `node#1`, …) and step provenance identical to the queued path, and the
  duplicate traversal logic is removed.

- 57900b5: Add workflow run time-travel. A run's durable history (`getRunHistory`) is one row per step attempt with lifecycle timestamps; `buildRunTimeline(history)` explodes those into a flat, chronologically-ordered event stream and `reconstructStateAt(timeline, at)` folds it up to any point — a seq index or a `Date` — to recover what the run "knew" then: per-step status, the accumulated step-result cache, the walked path (via `fromStepName`), and a derived phase. These are pure, transport-independent functions (same fold for Redis/Kysely/in-memory), exported from `@pikku/core/workflow` alongside `reconstructFinalState`. `PikkuWorkflowService` gains `getRunTimeline(id)` and `reconstructRunStateAt(id, at?)` that wrap them over a run's history, inherited by every backend. Correctly handles retries (a retry's created event reopens the step and clears the prior outcome) and graph cycles (revisit ordinals are distinct path entries).
- 72694f6: feat(workflow): expose per-step attempt count + record running/succeeded/failed timestamps

  `getRunStatus` now returns `attempts` (the latest attempt count) per step, so
  consumers can show retry counts without a second history query. It already
  computed `duration` from `runningAt`/`succeededAt`, but the kysely and mongodb
  workflow stores only stamped those timestamps on the _insert_ path — the
  `running` / `succeeded` / `failed` status transitions updated the history row's
  status without setting `runningAt` / `succeededAt` / `failedAt`, so `duration`
  was always undefined. The transitions now stamp the matching timestamp, so step
  duration is populated for kysely- and mongodb-backed runs. (Redis already
  stamped on transition.) A shared service-suite test guards both behaviours.

## 0.12.38

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

## 0.12.37

### Patch Changes

- ae7fc5d: Include gateway platform and auth fields in inspected gateway metadata.
- fa7a09c: Add gateway metadata generation and display enabled gateways in the console.

## 0.12.36

### Patch Changes

- f6adc1c: LocalMetaService.getEmailMeta no longer caches — it reads the generated
  pikku-emails-meta.gen.json fresh on each call (a local JSON read is cheap),
  so newly-generated email templates surface without restarting the process.

## 0.12.35

### Patch Changes

- 6bca38f: Extend `aiAgentRunner` with AI SDK-style media methods for transcription, speech, image generation, embeddings, and reranking.

  Move `voiceInput` and `voiceOutput` into `@pikku/core/ai-agent`, backed by the injected `aiAgentRunner`.

  Deprecate `@pikku/ai-voice` and strip its exports.

## 0.12.34

### Patch Changes

- 2eaa9fd: fix(workflow): seed sessionService when session already present on wire

  When a parent workflow propagates its session to a child workflow via
  `wire.session`, `resolveSession` skipped `setInitial` because `!wire.session`
  was false, so `sessionService.freezeInitial()` returned `undefined` and
  immediately overwrote the propagated session. We now seed the sessionService
  with the existing `wire.session` so `freezeInitial()` returns the correct
  session for `pikkuFunc` steps inside child workflows.

## 0.12.33

### Patch Changes

- 5c67b7e: Add a dedicated `@pikku/core/services/temporary-file-service` export for the Node filesystem-backed temporary file service without routing it through the `services` barrel.
- 1b22977: fix(workflow): propagate pikkuUserId and session to child workflow wires

  When a workflow calls `workflow.do()` on a sub-workflow, the child wire was created
  without `pikkuUserId`. This meant that `pikkuFunc` steps inside the child workflow
  could not resolve a session — `resolveSession` had nothing to look up, causing
  `ForbiddenError` for authenticated steps.

  Two fixes:
  - `childWire` now copies `pikkuUserId` from the parent RPC service's wire, so remote
    queue workers can re-hydrate the session from the session store.
  - `orchestrateWorkflow` now propagates `session` from the parent RPC wire into the
    child workflow's execution wire, so inline execution gets the session directly
    without an extra session-store round-trip.

## 0.12.32

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

- a027a8e: fix(core): compose repeated global middleware registrations instead of overwriting

  `addHTTPMiddleware(pattern, …)` and `addTagMiddleware(tag, …)` stored the
  middleware group with `groups[key] = middleware`, so a second registration for
  the same pattern/tag silently replaced the first. With Better Auth, generated
  `auth.gen.ts` registers `addHTTPMiddleware('*', [betterAuthSession()])`, which
  clobbered an app's own `addHTTPMiddleware('*', [...])` global middleware (cors,
  session, credential loading) and dropped it from every route.

  Both now append to the existing group (matching `addGlobalMiddleware`, which
  already appends), so generated auth middleware composes with user-registered
  global middleware. The route meta lists each pattern once, so the combined
  group is still applied a single time per request.

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

## 0.12.31

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

## 0.12.30

### Patch Changes

- cd101a5: feat(core): add `auditLog` service slot for per-invocation audit logs

  `CoreSingletonServices` now declares `auditLog?: AuditLog`, giving the
  per-request audit log returned by `createInvocationAudit` a typed home in the
  service container. Apps wire it in `createWireServices`
  (`return { auditLog, kysely: createAuditedKysely(kysely, { audit: auditLog }) }`)
  and the runner flushes its buffer via `close()` when the invocation ends.

  Previously there was no slot to return it from: `audit` is typed `AuditService`
  (the durable sink, `.audit()`), while `createInvocationAudit` returns an
  `AuditLog` (the request-scoped buffer, `.write/.flush/.close`). Returning the
  buffer under `audit` was a type error, so audited-Kysely wiring could not
  type-check. `auditLog` is distinct from `audit` and never shadows it.

- ac16265: fix(core): read email template assets from the absolute `emailsMeta.src` directly

  `getEmailTemplateAssets` passed an absolute `baseDir` (e.g. `/project/emails`) into
  `readProjectFile`, which resolves `join(basePath, '..', relativePath)`. Because
  `path.join` does not treat an absolute second segment as a root reset, this produced
  a non-existent compound path (`/project/packages/functions/project/emails/...`), so
  every asset read returned `null` and the email preview reported all source files
  (`theme, locale, html, subject, text`) as missing. Read the assets directly via
  `readFile(join(baseDir, rel))` instead, which resolves correctly for an absolute
  base. Verified live: a previously all-missing preview now renders.

- a05e864: fix(core): allow multiple independent suspend points in one workflow

  `getSuspendStepName()` returned the constant `'__workflow_suspend'` for every
  `workflow.suspend()` call, so all suspends in a run shared a single step row.
  Once the first suspend resolved (row → `succeeded`), every later `suspend()`
  read that same `succeeded` row and fell straight through without pausing — so a
  workflow could only ever have one working suspend point, and a second one (e.g.
  wait-for-build, then wait-for-approval) was silently skipped.

  The suspend step is now keyed on its `reason` (used raw, just namespaced so it
  can't collide with a `do`/`sleep` step of the same name), so each distinct
  reason is its own step row. A workflow can now have multiple independent
  suspends, including dynamic reasons in loops (`suspend(`Wait for ${i}`)`),
  exactly like dynamic `do()` step names. As with `do()`/`sleep()`, the reason is
  the suspend's stable identity and must be derived deterministically so it
  matches on replay. `suspend(reason)` is unchanged at the call site.

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

## 0.12.29

### Patch Changes

- 294e365: Fix body stream caching in PikkuFetchHTTPRequest so that arrayBuffer() can be called after body() has already consumed the stream via text(). This is required for Auth.js CSRF validation to work correctly when integrated with Pikku's internal fetch.

## 0.12.28

### Patch Changes

- 2cf67be: Add inline option to pikkuFunc/pikkuSessionlessFunc for workflow step dispatch

  By default, workflow steps now run inline (no queue hop). Set inline: false on a function to force dispatch through the queue for that step.

## 0.12.27

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

## 0.12.26

### Patch Changes

- 909eb25: Add audit logging support for function invocations and database queries.

  Introduces `AuditService` and `createAuditedKysely` — configurable audit capture with best-effort and transactional durability modes. Audit logs capture session metadata (user, org), RPC call details, and Kysely query operations (type, tables, changes). Audit context is scoped per-invocation so nested RPC calls are correctly attributed.

## 0.12.25

### Patch Changes

- 665bdb0: Add end-to-end data classification for SQLite and Postgres projects.

  **Core (`@pikku/core`):** New `Private<T>` and `Secret<T>` intersection brands, `ClassificationManifest`, `ColumnClassification`, and `AnonymizeStrategy` types exported from `data-classification.ts`.

  **CLI (`@pikku/cli`):**
  - SQL comment annotations: `-- @public`, `-- @private[:strategy]`, `-- @secret[:strategy]` on `CREATE TABLE` columns and `ALTER TABLE ... ADD COLUMN` statements. Unannotated columns default to `private`.
  - `pikku db migrate` now emits a `classification.gen.ts` manifest alongside `schema.d.ts`.
  - New `pikku db audit` command — prints a per-column classification summary and warns on `private`/`secret` columns with no anonymize strategy.
  - Postgres dialect support in `resolveDb`, `PostgresMigrationExecutor`, and `PostgresIntrospector`.

  **Inspector (`@pikku/inspector`):** New PKU910 check — `findPiiPaths()` walks inferred function return types looking for `__pii__` brands (including inside `Array<T>`, `Record<K,V>`, and index signatures) and fails the build if a function exposes branded fields in its output.

## 0.12.24

### Patch Changes

- c02275f: Add per-request API key override to AI agent runner

  `VercelAIAgentRunner` gains an optional `providerFactory` constructor param and a `withApiKey(apiKey)` method that forks a new runner scoped to a given key without touching the global singleton.

  `RunAIAgentParams` gains an optional `getCredential` accessor so callers can thread per-request credentials (e.g. a user's `AI_API_KEY` from the credential wire service) into `prepareAgentRun`. If a credential is found and the runner supports `withApiKey`, the runner is forked before the agent executes.

  `AIAgentRunnerService` interface gains the optional `withApiKey?` method.

- 0bd0433: Add `db.engine` and `db.pgVersion` to the CLI config types, and make local env-backed secrets fall back to raw strings when JSON parsing fails.

## 0.12.23

### Patch Changes

- 8d09f12: Forward pikkuAgent function name to LiteLLM as request metadata for per-agent usage breakdown.

  Adds an optional `agentId` field to `AIAgentRunnerParams`. The wiring layer (`runAIAgent`, `streamAIAgent`, and the resume path) sets this to the agent's registered function name before invoking the runner. `VercelAIAgentRunner` injects it into `providerOptions` as `metadata.agent_id` so LiteLLM includes it in spend logs, enabling per-agent token and cost breakdowns.

## 0.12.22

### Patch Changes

- 265461b: Improve schema identifier sanitization in the CLI and prefer specific runtime error messages in HTTP error responses.

## 0.12.21

### Patch Changes

- 9060165: Agents now declare their model directly as `<provider>/<model>` (e.g. `openai/gpt-4o`). The `models`, `agentDefaults`, and `agentOverrides` config blocks have been removed.

  **Migration:** replace any bare `model: 'alias'` values with the full provider-qualified form and remove those blocks from `pikku.config.json`.

- 9060165: WebSocket channels now expose `setState`, `getState`, and `clearState` — channel state and session lifecycle are managed independently.
- 9060165: Workflow steps now support per-step `retries` and `retryDelay` configuration. Cloudflare deployments gain Workflow Durable Object bindings for graph-DSL workflows on Workers-for-Platforms, and the deploy bundle now boots cleanly on the Cloudflare Workers runtime.

## 0.12.20

### Patch Changes

- 18acebe: feat(core): scope bare `rpc.invoke()` calls to the caller's addon package

  Addon functions calling `rpc.invoke('foo')` (bare, no colon) previously only
  resolved against root RPC meta and threw `RPCNotFoundError` for the addon's
  own functions, forcing authors to prefix every call with their consumer-facing
  namespace (`'cli:foo'`) — which couples the addon to its caller's `wireAddon({ name })`.

  `ContextAwareRPCService` now carries an optional `packageName` passed through
  from `runPikkuFunc` via `getContextRPCService`. For bare names from inside an
  addon, resolution first checks the caller's package function meta, then falls
  back to root. Applies to both `rpc.invoke()` and `rpc.rpcWithWire()`. Explicit
  namespaced calls (`'stripe:createCharge'`) and root-namespace calls are unchanged.

- 66d1b4f: feat(content)!: bucket-aware ContentService with typed object args

  BREAKING CHANGE: All `ContentService` methods now take object args with a
  required `bucket` field. The interface is generic over `TBucket extends string`
  so callers can constrain bucket names to a typed union.

  Migration:

  ```ts
  // Before
  content.getUploadURL(fileKey, contentType)
  content.signContentKey(key, expiresAt)
  content.writeFile(assetKey, stream)
  content.readFile(assetKey)
  content.deleteFile(assetKey)

  // After
  content.getUploadURL({ bucket, fileKey, contentType })
  content.signContentKey({ bucket, contentKey, dateLessThan: expiresAt })
  content.writeFile({ bucket, key, stream })
  content.readFile({ bucket, key })
  content.deleteFile({ bucket, key })
  ```

  - New exported types: `SignContentKeyArgs`, `SignURLArgs`, `GetUploadURLArgs`,
    `UploadURLResult`, `BucketKeyArgs`, `WriteFileArgs`, `CopyFileArgs`.
  - `LocalContent` stores objects under `<base>/<bucket>/<key>`.
  - `S3Content` and `B2Content` treat the logical bucket as a key prefix within
    the configured underlying storage bucket.
  - `workflow-screenshot` addon takes `bucket?` / `key?` input; default bucket
    resolved from `PIKKU_WORKFLOW_SCREENSHOT_BUCKET` variable, no hardcoded
    fallback.

- 3e35b99: feat(core): scope bare workflow names to the caller's addon package

  Parallel to the RPC scoping fix for addon functions. Addon code calling
  `services.workflowService.runToCompletion('myWorkflow', ...)` (bare name,
  no colon) previously missed workflows registered under the addon's package
  scope and threw `WorkflowNotFoundError`, forcing authors to hard-code
  the consumer-facing namespace (`'cli:myWorkflow'`) — which couples the
  addon to its caller's `wireAddon({ name })`.

  `getOrCreatePackageSingletonServices` in the function-runner now wraps
  the package's `workflowService` with a Proxy that auto-prefixes bare
  workflow names on `startWorkflow` / `runToCompletion` with the addon's
  consumer-defined namespace (looked up from `pikkuState(null, 'addons',
'packages')`). Explicit `'ns:name'` calls and root-namespace workflows
  are unchanged.

## 0.12.19

### Patch Changes

- b9ed73e: Add deterministic workflow planned-step metadata support and SSE init stream payload generation.
  - Persist `deterministic` and `plannedSteps` on workflow runs in core and service adapters.
  - Expose planned-step metadata on workflow run status responses.
  - Emit an initial `type: 'init'` SSE event for deterministic workflow streams before incremental updates.
  - Add CLI tests covering serialized stream route output for init/update/done event behavior.

## 0.12.4

## 0.12.18

### Patch Changes

- 311c0c4: Unify session persistence through SessionStore, remove session blob from ChannelStore
  - PikkuSessionService now persists sessions via SessionStore on set()/clear() instead of every function call
  - ChannelStore no longer stores session data — maps channelId to pikkuUserId only
  - ChannelStore API: setUserSession/getChannelAndSession replaced with setPikkuUserId/getChannel
  - Serverless channel runner resolves sessions from SessionStore using pikkuUserId from ChannelStore

## 0.12.17

### Patch Changes

- 854737b: Add `ListInput<F, S>` / `ListOutput<Row>` / `Filter<F>` types for list-function primitives.

  A "list function" is any Pikku function that returns a paginated collection. Adopting this shape unlocks a shared vocabulary across MCP tools, AI agents, typed RPC clients, and widget libraries — they all reason about cursor, filter, sort, and search uniformly.

  These are purely structural constraints; no runtime behaviour change. A list function is still a normal `pikkuFunc` whose input extends `ListInput<F, S>` and output extends `ListOutput<Row>`.

  ```ts
  import { pikkuFunc } from '#pikku'
  import type { ListInput, ListOutput } from '@pikku/core'

  export const listSessions = pikkuFunc<
    ListInput<{ status?: SessionStatus[] }, 'user' | 'status' | 'uploaded_at'>,
    ListOutput<Session>
  >({
    func: async ({ kysely }, input) => {
      /* ... */
    },
  })
  ```

  `Filter<F>` is a recursive AND/OR tree: arrays are AND of children, objects with label keys are OR of children, single-key objects with a field name from `F` are leaf predicates. Leaf operators mirror Prisma's vocabulary (`equals`, `in`, `notIn`, `gt`, `gte`, `lt`, `lte`, `contains`, `startsWith`, `endsWith`, `not`, `mode`).

  Follow-ups (separate PRs): `applyFilter<DB>(qb, filter)` Kysely helper, `usePikkuListQuery` in the CLI's react-query generator, first-class MCP list-tool shape.

## 0.12.16

### Patch Changes

- fbcf5b9: Add middleware priority system, telemetry middleware, and statusCode getter. Middleware now supports named priority levels (highest, high, medium, low, lowest) that control execution order regardless of registration order. Includes telemetryOuter and telemetryInner middleware for observability instrumentation via structured console.log output. PikkuHTTPResponse now exposes a readonly `statusCode` getter across all response implementations.

## 0.12.15

### Patch Changes

- 9e8605f: Add Workers for Platforms dispatch namespace support and AI agent fixes.
  - deploy-cloudflare: Thread dispatchNamespace through deploy pipeline, reads CF_DISPATCH_NAMESPACE env var
  - core: Fix auth-gated tools visible to unauthenticated sessions (null session now hides permission-gated items)
  - core: Recursive null stripping in AI agent tool call resume path
  - ai-vercel: Handle anyOf/oneOf/array types when making optional fields nullable for strict providers

- 624097e: Add deploy pipeline with provider-agnostic architecture
  - Add MetaService with explicit typed API, absorb WiringService reads
  - Add deployment service, traceId propagation, scoped logger
  - Rewrite analyzer: one function = one worker, gateways dispatch via RPC
  - Add Cloudflare deploy provider with plan/apply commands
  - Add per-unit filtered codegen for deploy pipeline
  - Skip missing metadata in wiring registration for deploy units
  - Fix schema coercion crash when schema has no properties
  - Fix E2E codegen: double-pass resolves cross-package Zod type imports

- 7ab3243: Add server-fallback deployment target for functions that can't run serverless.

  Functions can declare `deploy: 'serverless' | 'server' | 'auto'`. With `serverlessIncompatible` config, the analyzer auto-routes functions using incompatible services to a container.

  Server functions are merged into a single tree-shaken unit with a PikkuUWSServer entry, Dockerfile, and CF Container proxy Worker.

  Also adds sub-path exports to @pikku/cloudflare for tree-shaking (greet bundle 1.6MB → 444KB) and deploy verifiers for cloudflare, serverless, and azure providers.

## 0.12.14

### Patch Changes

- f85c234: Add unified credential system with per-user OAuth and AI agent pre-flight checks
  - Unified CredentialService with lazy loading per user via pikkuUserId
  - wire.getCredential() for typed single credential lookup
  - MissingCredentialError with structured payload for client-side connect flows
  - Console UI: Global/Users credential tabs, per-user OAuth connect/revoke
  - AI agent pre-flight check: detects missing OAuth credentials from addon metadata, shows "Connect your accounts" prompt before chat
  - CLI codegen: generates credentialsMeta per addon package for runtime lookup
  - Vercel AI runner: catches MissingCredentialError as runtime fallback

- 88d3100: Fix CLI command resolution for addon functions by passing packageName to addFunction during registration.

## 0.12.13

### Patch Changes

- 2ce0733: Fix credential services template variable passing, duplicate body/path param collision, and add credentialOverrides to wireAddon.

## 0.12.12

### Patch Changes

- 84f01ad: Add credentialOverrides to wireAddon for remapping credential names, fix credential services template to pass variables argument.

## 0.12.11

### Patch Changes

- 4e52200: Add \_\_raw CLI channel handler for server-side arg parsing. Enables WebSocket CLI clients to send raw args without needing client-side command metadata.

## 0.12.10

### Patch Changes

- 0f59432: Add per-user credential system with CredentialService, OAuth2 route handlers, and KyselyCredentialService with envelope encryption
- 52b64d1: Provide workflow wire to graph nodes for sleep/suspend support. Graph nodes now receive a workflow wire alongside the graph wire, enabling tools like `graph:sleep` to work in graph execution context. Improves dynamic workflow system instructions with output path documentation, nested path examples, and design principles for AI agents.

## 0.12.9

### Patch Changes

- e412b4d: Replace raw Error throws in AI agent runner/stream/prepare with typed PikkuError subclasses. `AIProviderNotConfiguredError` (503) replaces "AIAgentRunnerService not available" with a user-friendly message. `AIProviderAuthError` (401) available for API key validation errors.
- 53dc8c8: Fix toWebRequest to respect x-forwarded-proto and x-forwarded-host headers behind reverse proxies. Previously always used http:// which broke OAuth callback URLs behind TLS-terminating proxies like Fly.io.
- 0a1cc51: Add secure defaults for cookie authentication: httpOnly, secure, sameSite 'lax', and path '/'. User-provided options override these defaults.
- 0a1cc51: Prevent internal error details from leaking to clients. Stack traces via exposeErrors are now blocked in production. SSE and WebSocket error handlers use registered error responses instead of raw error messages. Secret key names and route paths are no longer included in error messages.
- 0a1cc51: Cap form-urlencoded parameters at 256 to prevent abuse via unbounded parameter parsing.
- 0a1cc51: Add path traversal protection to LocalContent file operations. Asset keys are now validated to stay within the configured upload directory.
- 0a1cc51: Use private Symbol for global pikku state key to prevent external code from accessing framework internals via Symbol.for().
- 0a1cc51: Filter out **proto**, constructor, and prototype keys during request data merging to prevent prototype pollution.
- 0a1cc51: Improve LocalContent URL signing with proper signedAt/expiresAt parameters. When an optional JWTService is provided, URLs include a cryptographic signature for verification.
- 0a1cc51: Fix timeout middleware to use Promise.race instead of throwing inside setTimeout, which caused uncatchable exceptions that crashed the process.
- 0a1cc51: Use constant-time comparison for static bearer token authentication to prevent timing side-channel attacks.
- 8b9b2e9: Fix child workflow completion in queued execution mode. When a sub-workflow completes, the parent step is now marked as succeeded and the parent orchestrator resumes automatically via `onChildWorkflowCompleted`. Adds `parentStepId` to `WorkflowRunWire` to track the parent step without querying. Retains advisory locks in PgKyselyWorkflowService for concurrency safety. Fixes pgboss `registerQueues` to accept an optional logger parameter.
- 8b9b2e9: Add debug-level logging to workflow service for step scheduling, execution, and orchestration to aid troubleshooting.
- b973d44: Add `inline` property to workflow function definitions. When `inline: true` is set on a workflow, it always executes inline without dispatching to the queue service, even when a queue service is available. This is useful for workflows that should run synchronously within the parent process (e.g. scaffolding/setup steps that produce local files).

  The flag flows from the function definition through the inspector, into the serialized workflow graph, and is checked at runtime by the workflow service.

- 8b9b2e9: Strip undefined values from workflow step data before dispatching to the queue service, preventing postgres UNDEFINED_VALUE errors.
- 8b9b2e9: Support sub-workflow invocation in graph-based workflow steps. When a step's rpcName refers to a registered workflow instead of an RPC function, `executeGraphStep` now starts it as a child workflow and polls for completion. Respects the `inline` meta flag on the sub-workflow.

## 0.12.8

### Patch Changes

- 09491c6: Fix toWebRequest to respect x-forwarded-proto and x-forwarded-host headers behind reverse proxies. Previously always used http:// which broke OAuth callback URLs behind TLS-terminating proxies like Fly.io.

## 0.12.7

### Patch Changes

- 66519c9: Remove explicit Transfer-Encoding and Connection headers from SSE responses. The transport layer handles chunked encoding automatically, and setting it explicitly causes double-encoding behind reverse proxies like Caddy.

## 0.12.6

### Patch Changes

- bb27710: Add optional `uploadHeaders` to `ContentService.getUploadURL` return type, allowing storage backends (e.g. Backblaze B2) to provide required headers for direct uploads.
- a31bc63: Fix SSE error handler to send `[DONE]` as JSON (`{"type":"done"}`) for consistency with all other SSE messages.
- 3e79248: Add setStepChildRunId to workflow service implementations and auto-bootstrap in pikku all
- b0a81cc: Support sub-workflows in `workflow.do()`: when a string name is passed, it now checks if the name refers to a registered workflow and runs it as a sub-workflow, falling back to RPC invocation if not found. The `TypedWorkflow.do` type now also accepts workflow names with typed input/output. Steps that spawn sub-workflows expose `childRunId` on the step state so clients can stream sub-workflow progress.
- 6413df7: Propagate session and RPC service from the originating request to workflow runs, fixing "Authentication required" errors for workflows with `auth: true`.

## 0.12.5

### Patch Changes

- 198e68f: Add hot-reload for dev mode: reload functions, middleware, and permissions without server restart.

## 0.12.4

### Patch Changes

- 688b5e8: InMemoryWorkflowService now implements WorkflowRunService interface, adding listRuns, getRunSteps, getDistinctWorkflowNames, and deleteRun methods.

### Patch Changes

- InMemoryWorkflowService now implements WorkflowRunService interface (listRuns, getRunSteps, getDistinctWorkflowNames, deleteRun)

## 0.12.3

### Patch Changes

- 387b2ee: Add approval descriptions, rename requiresApproval to approvalRequired, export all service interfaces, add exposeErrors option to HTTP runner, promote addons to top-level state, add packageName to CommonWireMeta, add errors to function config, and improve agent runner streaming
- 32ed003: Add envelope encryption utilities and database-backed secret services with KEK rotation support
- 7d369f3: Fix agent sub-agent tool execution failures: use UUID for sub-agent thread IDs (was exceeding varchar(36) DB column), and synthesize error results for failed tool calls in non-streaming run() to prevent "Tool result is missing" cascading errors.
- 508a796: Fix MCP server not exposing addon tools: resolve namespaced function IDs in MCP runner, load addon schemas after schema generation, and use resolveFunctionMeta for MCP JSON serialization
- ffe83af: Add Web Response passthrough support and fix close() flushing
  - HTTP runner detects when a function returns a Web `Response` object and applies it directly via `applyWebResponse()`, enabling seamless integration with libraries like Auth.js
  - Add `send()` method to `PikkuHTTPResponse` for setting body without Content-Type headers
  - Add `headers()` method to `PikkuHTTPRequest` for retrieving all headers as a record
  - Add `toWebRequest()` and `applyWebResponse()` utilities for Web Request/Response conversion
  - Fix `close()` in Express, Fastify, and UWS responses to flush buffered status/headers/body before ending the connection

- c7ff141: Add WorkflowVersionStatus type with draft→active lifecycle for AI-generated workflows, type all DB status fields with proper unions instead of plain strings

## 0.12.2

### Patch Changes

- cc4c9e9: Add gateway meta-wiring for messaging platforms:
  - New `wireGateway()` API with three transport types: webhook, websocket, listener
  - `GatewayAdapter` interface for platform-specific parse/send logic
  - `PikkuGateway` wire object (`wire.gateway`) with senderId, platform, and send()
  - `GatewayService` interface and `LocalGatewayService` for listener gateway lifecycle
  - `createListenerMessageHandler()` helper for building listener message callbacks
  - Add `'gateway'` to `PikkuWiringTypes` and `gateway` to `PikkuWire`
  - Add `gateway` state block to `PikkuPackageState`

- 3e04565: chore: update dependencies to latest minor/patch versions

## 0.12.1

### Patch Changes

- 62a8725: Rename 'external' to 'addon' throughout the codebase. All types, functions, config keys, and CLI options previously named `external` or `External` are now named `addon` or `Addon` (e.g. `ExternalPackageConfig` → `AddonConfig`, `externalPackages` → `addons`, `function-external` → `function-addon`).
- a3bdb0d: Add AI middleware hooks for per-tool-call lifecycle and post-step observability:
  - `beforeToolCall` / `afterToolCall`: per-tool-call hooks for logging, caching, input sanitization, and result transformation
  - `afterStep`: post-step observation hook with full step context (text, toolCalls, toolResults, usage, finishReason)
  - `onError`: error-specific hook for alerting and diagnostics (non-throwing, won't affect error flow)

- e0349ff: Fix critical security vulnerability in channel message handler: `validateAuth` was being called with `channelHandler` (always truthy) instead of the actual user session, meaning auth checks always passed and unauthenticated clients could send messages to protected channels. Also fix an information disclosure issue where the full channel config object was being logged on unhandled messages.
- 62a8725: Internalize singleton services management in the serverless channel runner, consistent with how other runners handle it. `createWireServices` and `singletonServices` no longer need to be passed explicitly to serverless channel runner calls.
- e04531f: Security hardening: improve CORS handling, redirect validation, and error logging in the HTTP runner. Export additional internal utilities needed by native runtime adapters.
- 62a8725: Fix security issue in `function-runner`: functions declared with `pikkuFunc` (which always require a session) now always throw `ForbiddenError` when called without a session, even if the wiring has `auth: false`. Previously a misconfigured wiring could bypass authentication entirely — the runner only logged a warning instead of blocking the call.
- a83efb8: Handle OPTIONS preflight requests automatically in fetchData when no explicit OPTIONS route is matched. Runs global HTTP middleware (e.g. CORS) and returns 204. Remove redundant startWorkflowRun and streamAgentRun pass-through functions from addon-console.
- 8eed717: Add `readonly` flag to function config and runtime enforcement. Functions can be marked `readonly: true` in their config. At runtime, if a session has `readonly: true`, only functions marked as readonly can be called — otherwise a `ReadonlySessionError` (403) is thrown.
- 62a8725: `pikku versions check` now prints rich, human-readable output for all contract version errors instead of raw error codes. Each error type (PKU861–PKU865) shows the function name, separate input/output schema hashes with a `prev → current` arrow, and clear next-step instructions.

  The version manifest now stores separate `inputHash` and `outputHash` per version entry (backward-compatible — old string-hash manifests still load and validate correctly). `VersionValidateError` gains optional detail fields (`functionKey`, `version`, `previousInputHash`, `currentInputHash`, `previousOutputHash`, `currentOutputHash`, `nextVersion`, `latestVersion`, `expectedNextVersion`) for use by tooling.

- 62a8725: Replace config-based addon declarations with the new `wireAddon()` code-based API. Addons are now declared directly in wiring files using `wireAddon({ name, package, rpcEndpoint?, auth?, tags? })` instead of the `addons` field in `pikku.config.json`. The inspector reads these declarations from the TypeScript AST at build time.
- 62a8725: Add `secretOverrides` and `variableOverrides` support to `wireAddon()`. These optional maps allow an app to remap an addon's secret/variable keys to its own names (e.g. `secretOverrides: { SENDGRID_API_KEY: 'MY_EMAIL_API_KEY' }`). The inspector validates that all override keys exist in the app's own secrets/variables definitions.

### New Features

- AI agents with `pikkuAIAgent()` — define agents with tools, sub-agents, memory, structured output, and streaming via SSE
- AI middleware hooks (`pikkuAIMiddleware`) for input, stream, and output transformation
- Tool approval flow — suspend agent execution pending human approval
- Channel middleware (`pikkuChannelMiddleware`) for intercepting and transforming channel events
- Remote RPC — call functions across servers with `rpc.remote()` and `DeploymentService`
- HTTP route groups with `wireHTTPRoutes` for shared basePath, tags, and auth
- Workflow graph engine with `createGraph()` type-safe builder
- Workflow HTTP helpers: `workflow()`, `workflowStart()`, `workflowStatus()`, `graphStart()`
- Workflow DSL with rich step types (branch, parallel, fanout, switch, filter)
- Trigger system with `wireTrigger()` and `wireTriggerSource()`
- OAuth2 support with `wireOAuth2Credential` and `OAuth2Client`
- Secret and variable declarations with `wireSecret()` and `wireVariable()`
- `TypedSecretService` and `TypedVariablesService` for compile-time validated access
- `defineCLICommands` and `defineChannelRoutes` for external composition
- Built-in CORS middleware
- `disabled: true` support on all wirings and functions
- `createWireServices` and `createConfig` are now optional
- `InMemoryWorkflowService` and `InMemoryTriggerService` for testing

### Breaking Changes

- `PikkuInteraction` → `PikkuWire`, `CreateSessionServices` → `CreateWireServices`
- `wireForgeCredential` → `wireCredential`
- `startWorkflowByWire` → `startWorkflowByHTTPWire`
- Renamed all `forge` → `node` naming
- Renamed `credential` → `secret` across core types
- `WorkflowService.createRun` signature changed (new `inline`, `graphHash` params)
- Auth enforced by default for `pikkuFunc`

## 0.11.0

## 0.11.2

### Patch Changes

- db9c7bf: Add workflow graph system with type-safe builder

### Features

- f35e89da: Add workflow graph system with type-safe builder
  - `createGraph<RPCMap>()` for building workflow graphs with full type safety
  - `wireWorkflowGraph()` for registering workflow graphs
  - `graphNode()` helper for type-safe node creation
  - Graph scheduler for execution (continueGraph, startWorkflowGraph)
  - TypedRef for type-safe input refs in workflow graphs
  - `setBranchTaken` added to WorkflowService interface
  - Trigger runner for workflow triggers

### Breaking Changes

- Rename `pikkuWorkflowFunc` to `pikkuWorkflowComplexFunc`
- Rename `pikkuWorkflowDSTFunc` to `pikkuWorkflowFunc`

## 0.11.1

### Patch Changes

- 4b811db: chore: updating all dependencies
- e12a00c: feat: adding initialSession to PikkuWire which is correctly typed (undefined / not depending on function type)
- 4579434: breaking: changing the signature of functions
- 28aeb7f: breaking: extract docs in the wiring meta
- ce902b1: feat: adding in pikkuSimpleWorkflowFunc
- 06e1a31: breaking: change session services to wire services

### Minor Changes

- Add workflow orchestration engine with step execution and retries
- Add scheduler service abstraction
- Remove file-based channel and eventhub stores

# @pikku/core

## 0.10.2

### Patch Changes

- ea652dc: Refactor channel middleware handling and add lifecycle middleware support

  **Breaking Changes:**
  - Improved middleware resolution for channel message handlers to properly combine channel-level and message-level middleware
  - Fixed cache key collisions when multiple message handlers use the same function

  **New Features:**
  - Add `runChannelLifecycleWithMiddleware` helper in `channel-common.ts` for consistent lifecycle function execution
  - Support middleware on `onConnect` and `onDisconnect` lifecycle functions
  - Channel-level middleware now properly applies to all messages in the channel

  **Bug Fixes:**
  - Fix middleware ordering: channel middleware → message middleware → inherited middleware
  - Fix cache key generation to include routing information (prevents cache collisions)
  - Properly detect wrapper objects vs direct function configs for message handlers

- 4349ec5: Add file-based storage implementations for serverless environments

  **New Services:**
  - Add `FileChannelStore` for file-based channel storage (suitable for AWS Lambda /tmp)
  - Add `FileEventHubStore` for file-based event hub subscriptions
  - Export new services in package.json for use in serverless runtimes

  **Bug Fixes:**
  - Fix serverless channel runner to handle disconnect gracefully when channel is already cleaned up
  - Fix MCP runner to pass `mcp` service to functions and use correct function type

- 44d71a8: fix: fixing inspector ensuring pikkuConfig is set

## 0.10.1

### Patch Changes

- 778267e: fix: fixing inspector ensuring pikkuConfig is set

## 0.9.0

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.12-next.0

### Patch Changes

- feat: running @pikku/cli using pikku

## 0.9.11

### Patch Changes

- 6ee87c1: fix: local content server name slashes

## 0.9.10

### Patch Changes

- a2062b7: feat: adding a server url prefix for local content

## 0.9.9

### Patch Changes

- 99c2b3a: fix: removing duplicated interaction values from pikku functions

## 0.9.8

### Patch Changes

- ea89575: feat: adding the ability for custom schema validation / retrieving schemas to use (for example with openapi json_response)

## 0.9.7

### Patch Changes

- 85a1c76: fix: fixing delete method return type in local-content and ignoring body (for now) in delete calls

## 0.9.6

### Patch Changes

- 6059c87: refactor: move PikkuPermission to pikkuPermission and same for middleware for api consistency to to improve future features
- 6db63bb: perf: changing http meta to a lookup map to reduce loops
- 74f8634: perf: moving router externally to be able to swap them out, similar to hono
- 766fef1: feat: adding caching for middleware and permissions

## 0.9.5

### Patch Changes

- 7e1f5b3: feat: implement ordered middleware and permission execution system

  ## New Features

  ### Ordered Execution System

  Both middleware and permissions now execute in a specific hierarchical order:
  1. **Wiring Tags** - Tag-based middleware/permissions from wiring level (e.g., HTTP route tags)
  2. **Wiring Middleware/Permissions** - Direct wiring-level middleware/permissions
  3. **Function Middleware** - Function-level middleware
  4. **Function Tags** - Tag-based middleware/permissions from function level

- b443405: feat: adding middleware and functions by tags

## 0.9.4

### Patch Changes

- c18800d: feat: adding queue and scheduledTask to interactions

## 0.9.3

### Patch Changes

- 9691aba: fix: add-functions should support both functions only and objects
- 2ab0278: refactor: no longer import ALL functions, only the ones used by rpcs
- 81005ba: feat: creating a smaller meta file for functions to reduce size

## 0.9.2

### Patch Changes

- 1256238: feat: pikkufunc in types extends function config to include all the different params
- 6cf8efd: feat: Adding PikkuDocs to function definition

  refactor: renaming APIDocs to PikkuDocs

- d3a9a09: refactor: change addMiddleware to addHTTPMiddleware due to route support'

  chore: export addHTTPMiddleware from pikku-types for consistency

- 840e078: refactor: change APIMiddleware type to PikkuMiddleware
- 667d23c: feat: adding expose to function config (although it isn't yet wired up)
- a5905a9: chore: updating all dependencies

## 0.9.1

### Patch Changes

- fdb1593: core: bumping everything with a patch to sync up the major release inconsistencies in dependencies

### Breaking Changes

- Normalized all transports to use "wirings" instead of events/routes/transports for consistency across the framework

## 0.8.0

## 0.8.2

### Patch Changes

- 0fb4b3d: refactor: mcp server expects json and not file path

## 0.8.1

### Patch Changes

- 3261090: refactor: moving mcp endpoints into core
- 7c592b8: feat: support for required services and improved service configuration

  This release includes several enhancements to service management and configuration:
  - Added support for required services configuration
  - Improved service discovery and registration
  - Added typed RPC clients for service communication
  - Updated middleware to run per function

- 30a082f: refactor: moving service implementations out of pikku/core since they aren't all edge compatible

### Major Features

- **Model Context Protocol (MCP) Support**: Added MCP implementation with resources, tools, and prompts
- **Queue System**: Added queue support with runners and workers
- **RPC (Remote Procedure Calls)**: Added typed RPC calls inside functions with local and remote support
- **Middleware Runner**: Added middleware runner to functions for enhanced request processing
- **Multiple Bootstrap Files**: Added support for different transport bootstrap files
- **Middleware Runner**: Run middleware on any function

## 0.7.8

### Patch Changes

- 8b4f52e: fix: nextjs compatability with 0.7
- 8b4f52e: refactor: moving schemas in channels to functions
- 1d70184: feat: adding multiple bootstrap files for different transports

## 0.7.7

### Patch Changes

- 6af8a19: fix: always write functions meta data

## 0.7.6

### Patch Changes

- 6166c74: fix: odd missing file

## 0.7.5

### Patch Changes

- 46d4458: feat: we now have typed rpc calls inside of functions!

## 0.7.4

### Patch Changes

- 598588f: fix: generating output schemas from function meta

## 0.7.3

### Patch Changes

- 534fdef: feat: adding rpc (locally for now)

## 0.7.2

### Patch Changes

- bb59874: fix: only try validating schemas if they exist in function runner

## 0.7.1

### Patch Changes

- cd83e0a: fix: invalid logroutes log line

We now use the function first approach internally, which means first all the functions register, and then events call call them.

The main breaking changes for the end user are:

- We now declare functions using `pikkuFunc<In, Out>(async () => {})
- We renamed addRoute to wireHTTPs

We also removed all the different types of functions. Everything is now either an APIFunction of APIFunctionSessionless. The channel (eventHub or any other transport specific service) is now injected in the service itself.

## 0.6.27

### Patch Changes

- 8658745: refactor: changing content service to use streams for performance benefits
- d0968d2: fix: fixing content uploads for s3

## 0.6.26

### Patch Changes

- 412f136: updating local content service

## 0.6.25

### Patch Changes

- b774c7d: fix: coerce top level data from schema now includes date strings

## 0.6.24

### Patch Changes

- 531f4b5: refactor: using userSession.set to set cookies with middleware

## 0.6.23

### Patch Changes

- 1c8c470: fix: await schema validation

## 0.6.22

### Patch Changes

- 60b2265: refactor: supporting request and response objects

## 0.6.21

### Patch Changes

- aab52d4: revert: add http back to all services until we figure out best way to set session from a function

## 0.6.20

### Patch Changes

- 1d43a9a: feat: adding context to allow middleware to set values (not typed)

## 0.6.19

### Patch Changes

- 9fb2b99: refactor: moving schemas to pikku state

## 0.6.18

### Patch Changes

- 6be081b: fix: export addMiddleware correctly

## 0.6.17

### Patch Changes

- ebc04eb: refactor: move all global state into pikku state
- 8a14f3a: refactor: removing user session from channel object
- 2c47386: refactor: improving middleware

## 0.6.16

### Patch Changes

- 3cbdf9e: fix: adding missing crypto import

## 0.6.15

### Patch Changes

- 1c7dfb6: fix: fixing some import issues

## 0.6.14

### Patch Changes

- c1d8381: feat: adding filtering by tags to minimize produced payload
- ee5c874: feat: moving towards using middleware for http and channels

## 0.6.13

### Patch Changes

- eb8a8b4: fix: updating schema and cli build issue due to tsconfig settings

## 0.6.12

### Patch Changes

- e0dd19a: fix: invalid schemas should result in a 422

## 0.6.11

### Patch Changes

- 7859b28: breaking: changing overrides for addRoute to wrap instead due to random conflict override errors
- 269a532: fix: fixing some typing issues

## 0.6.10

### Patch Changes

- 4a4a55d: refactor: renaming EError to PikkuError

## 0.6.9

### Patch Changes

- f3550d8: feat: changing singleton constructor to accept a prtial map of existing services

## 0.6.8

### Patch Changes

- b19aa86: refactor: switching aws to using @aws-sdk/cloudfront-signer

## 0.6.7

### Patch Changes

- 0a92fa7: refactor: pulling schema into seperate package since ajv doesnt work on cloudflare (also keeps bundle size small!)

## 0.6.6

### Patch Changes

- 4357bca: feat: fixing up nextjs apis

## 0.6.5

### Patch Changes

- a40a508: fix: Fixing some generation bugs and other minors

## 0.6.4

### Patch Changes

- f26880f: feat: extracting inspector and adding unique type references

## 0.6.3

### Patch Changes

- 09fc52c: feat: adding cloudflare and lambda websockets
  breaking change: moved subscription from channel to services and renamed to event hub
- adecb52: feat: changes required to get cloudflare functions to work

## 0.6.2

### Patch Changes

- ed45ca9: feat: adding lambda serverless
- adeb392: feat: more channel improvements, and adding bubble option to runners to avoid all the empty try catches

## 0.6.1

### Patch Changes

- dee2e9f: feat: adding a subscription service change handler

Marking a major release to include channels and scheduled tasks

## 0.5.29

### Patch Changes

- 662a6cf: feat: adding scheduled tasks names
- c8578ea: fix: getting websocket auth to work on individual messages
- d2f8edf: feat: adding channelId to channels for serverless compatability

## 0.5.28

### Patch Changes

- a768bad: feat: adding channel permission service
- 886a2fb: refactor: moving singletons (like routes and channels) to global to avoid nodemodule overrides
- 886a2fb: fix: making core routes global to avoid state overrides

## 0.5.27

### Patch Changes

- aa8435c: fix: fixing up channel apis and implementations

## 0.5.26

### Patch Changes

- ab42f18: chore: upgrading to next15 and dropping pages support

## 0.5.25

### Patch Changes

- 0f96787: refactor: dropping cjs support
- 64e4a1e: refactor: seperating core into cleaner sub-packages
- c23524a: refactor: bump to versions to ensure correct package usage

## 0.5.24

### Patch Changes

- bba25cc: chore: updating all packages to reflect major changes
- 9deb482: refactor: finalizing stream api
- ee0c6ea: feat: adding ws server

## 0.5.23

### Patch Changes

- 7fa64a0: feat: making schedule session services optional
- 539937e: refactor: use a map instead for scheduled tasks
- e9a9968: refactor: completing rename of stream to channel

## 0.5.22

### Patch Changes

- 73973ec: fix: data type for methods is optional

## 0.5.21

### Patch Changes

- 179b9c2: fix: fixing stream types

## 0.5.20

### Patch Changes

- 5be6da1: feat: adding streams to uws (and associated refactors)

## 0.5.19

### Patch Changes

- cbcc75b: feat: adding scheduler types to core
- d58c440: refactor: making http requests explicit to support other types
- 11c50d4: feat: adding streams to cli

## 0.5.18

### Patch Changes

- bed9ab4: revert: reverting ajv array transformation
- d4dd093: feat: coerce top level strings to arrays

## 0.5.17

### Patch Changes

- 2f77f5f: feat: coerce array types if needed via ajv validation

## 0.5.16

### Patch Changes

- 4046a85: feat: adding more error types

## 0.5.15

### Patch Changes

- 816eaaa: fix: don't throw an error if auth isnt required for a route

## 0.5.14

### Patch Changes

- 8531c5e: fix: export log routes in index since bundler can't find it

## 0.5.13

### Patch Changes

- 30b46aa: fix: looks like using patch lowercase breaks the node fetch client sometimes

## 0.5.12

### Patch Changes

- ff8a563: feat: only log warning errors for status codes we care about

## 0.5.11

### Patch Changes

- be68efb: fix: allow error handler to use errors other than EError
- 5295380: refactor: changing config object a getConfig function
- f24a653: feat: coerce types in ajv for correct validation / usage later on

## 0.5.10

### Patch Changes

- effbb4c: doc: adding readme to all packages

## 0.5.9

### Patch Changes

- 3541ab7: refactor: rename nextDeclarationFile to nextJSFile
- 725723d: docs: adding typedocs

## 0.5.8

### Patch Changes

- 1876d7a: feat: add error return codes to doc generation
- 8d85f7e: feat: load all schemas on start optionally instead of validating they were loaded

## 0.5.7

### Patch Changes

- df62faf: fix: bumping up routes meta

## 0.5.6

### Patch Changes

- 0883f00: fix: schema generation error

## 0.5.5

### Patch Changes

- 93b80a3: feat: adding a beta openapi standard

## 0.5.4

### Patch Changes

- 6cac8ab: feat: adding a do not edit to cli generated files

## 0.5.3

### Patch Changes

- 8065e48: refactor: large cli refactor for a better dev experience

## 0.5.2

### Patch Changes

- 5e0f033: feat: adding a routes map output file to support frontend sdks in the future

## 0.5.1

### Patch Changes

- 97900d2: fix: exporting plugins from default barrel files
- d939d46: refactor: extracting nextjs and fastify to plugins
- 45e07de: refactor: renaming packages and pikku structure

## 0.4.7

### Patch Changes

- ddaf58f: feat: adding hostname to servers

## 0.4.6

### Patch Changes

- 2a2402b: republish since something went wrong

## 0.4.5

### Patch Changes

- c73afd6: this should have been published..

## 0.4.4

### Patch Changes

- 0650348: fix: export schemas using \*
- 1a708a7: refactor: renaming PikkuCLIConfig back to PikkuConfig
  feat: adding .end() to pikku response for servers that need it
- 642d370: fix: adding schema error logs on fail

## 0.4.3

### Patch Changes

- 94f8a74: fix: finalizing cjs and esm packages

## 0.4.2

### Patch Changes

- 28f62ea: refactor: using cjs and esm builds!
- 14783ee: fix: including all types as dependencies to avoid users needing to install them

## 0.0.18 - 05.09.2022

feat: adding a maximum compute time for better error handling on lambda timeouts

## 0.0.17 - 24.08.2022

fix: use error name instead of constructor for better management of instanceof

## 0.0.10 - 21.07.2022

feat: add a transform session call incase jwt provided belongs to a third-party like aws cognito

## 0.0.9 - 26.06.2022

chore: Upgrading dependencies

## 0.0.6 - 13.04.2022

chore: Upgrading dependencies

## 0.0.5 - 19.02.2022

chore: Upgrading dependencies

## 0.0.4 - 26.09.2021

feat: Adding writeFile, readFile and deleteFile APIs

## 0.0.3 - 02.09.2021

chore: Updating dependencies

## 0.0.2 - 02.08.2021

Fix: deleting files with correct path in local files

## 0.0.1 - 27.07.2021

Fix: Using global space for schemas as it appears to not always return the same file

## 23.07.2021

### Initial Release

A package that contains pikku types
