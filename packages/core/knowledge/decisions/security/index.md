---
type: overview
title: Security decisions
description: Who may do what in core — gates, defaults, and the failures they are chosen to cause
---

# Security decisions

A rule about who may do what, and which way it fails when it is unsure.

<!-- pikku:knowledge-index -->
- [A dropped audit write is always logged](a-dropped-audit-write-is-always-logged.md) — The no-op audit service falls back to the singleton logger when the wire carries none, so an unconfigured audit call is never silent
- [An actor's missing approval decision defaults to denied](actor-flow-missing-approval-decisions-default-to-denied.md) — Every pending tool call gets an explicit decision; an id the persona LLM omitted is denied, so a dropped field can never read as consent
- [Actor sign-in is proven by Set-Cookie, not a non-empty jar](actor-sign-in-is-proven-by-set-cookie-not-a-non-empty-jar.md) — HttpScenarioActor tracks its own signedIn flag and requires the sign-in response itself to set a cookie, because a populated jar proves nothing
- [Actor sign-in only works for actor-flagged users](actor-sign-in-only-works-for-actor-flagged-users.md) — The scenario actor secret mints sessions for user rows flagged actor and nothing else, so holding it never impersonates a real user
- [Addon auth and tag gates apply only at the namespaced RPC boundary](addon-config-gates-apply-only-at-the-namespaced-rpc-boundary.md) — wireAddon's auth and tags are enforced on `ns:fn` calls, not on bare calls made inside the addon
- [Only a Symbol-branded framework result can request tool approval](ai-agent-approval-forwarding-requires-a-symbol-brand.md) — Approval markers are trusted from the APPROVAL_REQUIRED Symbol on a forwardsApproval tool, never from a JSON key an LLM could emit
- [Credential requests are trusted only when Symbol-branded](ai-agent-credential-requests-are-symbol-branded.md) — The string key is a wire field; the Symbol is the capability, and only core can mint it
- [An agent requires a session only when auth is true, but always enforces scopes and permissions](ai-agent-gate-requires-a-session-only-when-auth-is-true.md) — Agents follow pikkuSessionlessFunc semantics so crons and queue workers can run them; scopes are an AND gate checked before any permission I/O
- [An agent ownership failure never echoes the resource it refused](ai-agent-ownership-failures-never-echo-the-resource.md) — assertResourceOwner throws a bare ForbiddenError so the error cannot be used as an existence oracle, at the cost of thinner debugging output
- [Resuming a suspended agent run re-runs the agent's authorization gate](ai-agent-resume-re-runs-the-authorization-gate.md) — Ownership of the run is not enough — a grant revoked while the run was suspended must block the approval
- [Agent thread ownership fails closed when there is no principal](ai-agent-sessionless-deployments-have-no-thread-ownership.md) — A sessionless caller gets an ephemeral owner and reaches no stored thread, rather than reaching all of them
- [An agent thread key is always prefixed with the trusted principal](ai-agent-thread-ownership-composes-the-session-principal.md) — Ownership keys are composed as principal:resourceId, so a client id can sub-divide its own boundary but never widen it
- [Agent tool permission filtering reads the live function config, not the metadata](ai-agent-tool-filtering-reads-the-live-function-config.md) — The pikkuAuth brand survives only on live permission objects, so a metadata-driven check would silently admit every gated tool
- [An empty owners constraint matches nothing](an-empty-owners-constraint-matches-nothing.md) — owners is an authorization boundary, so every storage backend must treat [] as no rows rather than no filter
- [Core's SSRF guard matches host literals because edge runtimes have no DNS](core-safe-fetch-blocks-ssrf-by-host-literal-not-dns.md) — safeFetch rejects internal address literals and re-validates every redirect hop; it cannot stop DNS rebinding
- [Core secrets are encrypted with a per-secret DEK wrapped by a KEK](core-secrets-use-a-per-secret-dek-wrapped-by-a-kek.md) — Envelope encryption keeps ciphertext untouched during key rotation, at the cost of storing two blobs per secret
- [Gateway handlers run through the function runner gate](gateway-handlers-run-through-the-function-runner-gate.md) — A gateway's handler is registered as a real pikku function and invoked via runPikkuFunc, because calling it directly skips auth, scopes and permissions
- [Gateway middleware sessions must be bridged onto the wire](gateway-middleware-sessions-must-be-bridged-onto-the-wire.md) — Gateway middleware calling wire.setSession writes to a session service the handler's invocation never reads, so the session is copied onto wire.session before the gate runs
- [Global permissions and function permissions are independent gates](global-permissions-and-function-permissions-are-independent-gates.md) — Globals AND together and can only narrow access; a function's own group ORs internally and is never satisfied by a global
- [HTTP error detail is withheld from clients in production](http-error-detail-is-withheld-from-clients-in-production.md) — 5xx bodies carry only a trace id in production; exposeErrors can widen that in development but never in production
- [HTTP request bodies are bounded before they are buffered](http-request-bodies-are-bounded-before-they-are-buffered.md) — Content-Length is rejected up front and the stream is measured as it arrives, because that header is optional and attacker-controlled
- [MCP internal error details are double-gated on production](mcp-internal-error-details-are-double-gated-on-production.md) — exposeErrors is checked again against isProduction() at throw time so an explicit true cannot leak stack traces from a production build
- [Passphrases are stretched, key material is expanded](passphrases-are-stretched-key-material-is-expanded.md) — PBKDF2 guards low-entropy human input; HKDF derives from high-entropy secrets, and the two are never swapped
- [Auth filtering requires live permission functions, never their metadata](permission-auth-filtering-requires-live-permission-functions.md) — checkAuthPermissions collects pikkuAuth-branded predicates off the real config; passing metadata would let every gated tool through
- [Pikku carries actor scopes as data and the app grants them](pikku-carries-actor-scopes-as-data-and-the-app-grants-them.md) — scopes and roles on a ScenarioActorConfig are transported, never applied — the app's own seed reads them back and performs the grant
- [Queue jobs carry the producer's pikku user id](queue-jobs-carry-the-producers-pikku-user-id.md) — A job's pikkuUserId is trusted as identity by the worker, so enqueue rights are effectively act-as-user rights
- [Remote addon tokens are client credentials, not mesh trust](remote-addon-tokens-are-client-credentials-not-mesh-trust.md) — wireRemoteAddon authenticates as a client to a hosted library and fails closed on an empty token; it never uses PIKKU_REMOTE_SECRET
- [Scenario-step functions are never externally invocable over RPC](scenario-step-functions-are-never-externally-invocable.md) — rpcExposed requires expose and rejects scenarioStep, so test steps stay reachable only from inside a scenario run
- [Scope resolution happens at the session boundary and scope sync never deletes](scope-resolution-happens-at-the-session-boundary-and-sync-never-deletes.md) — ScopeService is called when a session is built, never by the function runner, and syncScopes only ever adds — revoking is an explicit operation
- [Signed content URLs bind the request path and verify fail-closed](signed-content-urls-bind-the-request-path.md) — A signature that only carries timestamps authorizes every asset, and a verifier with no key must refuse rather than allow
- [Webhook bodies are signed before they are enqueued](webhook-bodies-are-signed-before-they-are-enqueued.md) — QueueWebhookService computes the HMAC at enqueue time so the signing key never travels in the queue payload
- [A scenario actor step always goes over the real transport and never through internal dispatch](workflow-actor-steps-always-use-the-real-transport.md) — Internal dispatch would bypass auth middleware and permissions, turning a scenario into a green health check that proves nothing
- [An approval decision is stored raw and validated on replay, and an invalid one closes the gate rather than failing the run](workflow-approval-payloads-are-validated-on-replay-inside-the-workflow.md) — The schema only exists inside the workflow body, and letting an external payload fail the run would let any caller kill a workflow
- [A queued workflow step rehydrates its session from the persisted run wire](workflow-queued-steps-rehydrate-their-session-from-the-run-wire.md) — The queue job payload is just `{ runId }`, so without threading `pikkuUserId` an authed step sees no session and throws
- [Scenario sessions are isolated per actor and reset between scenarios](workflow-scenario-sessions-are-isolated-per-actor-and-per-scenario.md) — One jar per actor keeps two personas from sharing a session; a browser reset keeps one scenario from leaving the next signed in as somebody else
- [A scenario step is never registered as a callable RPC and never dispatched on the queue](workflow-scenario-steps-are-never-network-invocable.md) — A step drives a browser and holds an actor's session, so exposing it as an RPC would put that reach on the network
<!-- /pikku:knowledge-index -->
