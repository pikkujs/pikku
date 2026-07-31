---
'@pikku/core': patch
'@pikku/cli': patch
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

Close five security weaknesses found in a review of `@pikku/core`. Four of the
five are breaking, and two invalidate data or credentials already in the wild —
read the migration notes before upgrading.

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
