---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/addon-console': patch
'@pikku/node-http-server': patch
'@pikku/kysely': patch
'@pikku/mongodb': patch
'@pikku/redis': patch
'@pikku/cloudflare': patch
'@pikku/lambda': patch
'@pikku/azure-functions': patch
'@pikku/express': patch
'@pikku/express-middleware': patch
'@pikku/fastify-plugin': patch
'@pikku/uws-handler': patch
'@pikku/next': patch
---

Close nine security weaknesses found in a review of `@pikku/core`. Most are
breaking, and two invalidate data or credentials already in the wild — read the
migration notes before upgrading.

**Breaking: AI agent thread ownership now fails closed.** Reading, listing,
resuming or approving an existing thread or run requires a resolved session
principal (`userId`, or `orgId` for `sessionScope: 'org'`), regardless of the
agent's `auth` setting. Previously a request without a session had no ownership
model at all: the caller-supplied `resourceId` was accepted as the ownership
key, so any caller could read or resume another party's thread by naming its
`resourceId`. Worse, `threadOwnerConstraint` returned `undefined` for a
sessionless caller, and `undefined` means *no filter* rather than *no rows* —
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
