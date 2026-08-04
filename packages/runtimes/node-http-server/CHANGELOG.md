# @pikku/node-http-server

## 1.0.0

### Patch Changes

- Updated dependencies [62ea4cc]
- Updated dependencies [9dddff8]
- Updated dependencies [78b29f0]
  - @pikku/core@0.13.0
  - @pikku/modelcontextprotocol@1.0.0

## 0.12.7

### Patch Changes

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

## 0.12.6

### Patch Changes

- daec082: Drop Node 22 support — the minimum supported runtime is now Node 24 (LTS).

  Node 22 deadlocks `pikku dev` at `loadUserBootstrap` (tsx `register()` + `require(esm)` cycle handling on node 22.12+), and Node 20 is already below our floor. The `engines.node` requirement is raised to `>=24` across all packages, matching `.nvmrc` and the CI test matrix. Closes #751.

- Updated dependencies [7b17b14]
- Updated dependencies [daec082]
- Updated dependencies [e0fd352]
  - @pikku/core@0.12.58
  - @pikku/modelcontextprotocol@0.12.7

## 0.12.5

### Patch Changes

- d4a2503: Serve the console same-origin at /console (#861). Both dev servers gain
  `staticMounts` (prefix → directory static serving with SPA fallback and path
  traversal protection); `pikku serve` / `pikku dev` mount the bundled console
  app at `/console` on the API port whenever it is bundled, so auth cookies are
  first-party and no `?server=` param is needed. The console is built with
  `base: '/console/'` (its router already derives the basename from BASE_URL).
  The separate `--console <port>` static server is removed; `pikku console`
  serves the bundle under /console and redirects the root there.
- Updated dependencies [61c9ce9]
- Updated dependencies [f1f39f8]
- Updated dependencies [c45e98d]
- Updated dependencies [472a349]
  - @pikku/core@0.12.52

## 0.12.4

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44
  - @pikku/modelcontextprotocol@0.12.5

## 0.12.3

### Patch Changes

- e6bb2d6: feat(node-http-server): dispatch cron + queue jobs into the server-target container

  A `deploy: 'server'` unit runs in a long-lived Node container and is never
  uploaded as a CF script, so its scheduled tasks and queue workers previously
  had no way to fire — dispatch only reached CF scripts. `PikkuNodeHTTPServer`
  now mounts two authenticated dispatch routes when `dispatchJobs` is enabled:
  `POST /__pikku/scheduler-job` (`runScheduledTask`) and `POST /__pikku/queue-job`
  (`runQueueJob`), gated by a `dispatchSecret` checked with `timingSafeEqual`
  against an `x-pikku-dispatch` header. The cloudflare adapter's generated server
  entry now passes `{ dispatchJobs: true, dispatchSecret: process.env.PIKKU_DISPATCH_SECRET }`,
  so a fabric proxy can forward `/__pikku/*` dispatch to the container exactly
  like it forwards HTTP — one dispatch primitive for both runtimes.

## 0.12.2

### Patch Changes

- ccd9e27: Auto-mount the MCP server in PikkuNodeHTTPServer
- bc28e3b: Make the MCP mount path configurable via the `mcpPath` option (default `/mcp`) and route to the MCP handler only on an exact `/mcp` path boundary instead of any `/mcp`-prefixed path.
- Updated dependencies [cd101a5]
- Updated dependencies [ac16265]
- Updated dependencies [a05e864]
- Updated dependencies [20750fd]
  - @pikku/core@0.12.30

## 0.12.1

### Patch Changes

- 9060165: Fix `@pikku/addon-graph` package exports so generated bootstrap files can be imported correctly. The Node.js HTTP server adapter is unified across dev, standalone, and container deployments. Next.js gains a worker-RPC transport. Date values in fetch responses now deserialise correctly.
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
  - @pikku/core@0.12.21
