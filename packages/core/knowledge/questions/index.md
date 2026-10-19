---
type: overview
title: Questions
description: Things asked of core and not yet answered
---

# Questions

Something asked and not yet answered. A question earns a note when the code
currently makes a choice that nobody has defended — the choice stays, the doubt
gets recorded.

<!-- pikku:knowledge-index -->

- [Does a bearer JWT with no identity claim count as a session?](a-bearer-jwt-with-no-identity-becomes-a-session.md) — The cookie middleware refuses an identity-less JWT, but authBearer sets whatever decode returns, so the two paths disagree
- [A channel's middleware list accepts bare factories that nothing ever resolves](channel-middleware-accepts-bare-factories-that-nothing-resolves.md) — CoreChannel.channelMiddleware admits CorePikkuChannelMiddlewareFactory, but no runner calls one, so a bare factory would stall the chain
- [Does a delayed RPC run as the session it was scheduled with?](does-a-delayed-rpc-run-as-the-session-it-was-scheduled-with.md) — The in-memory scheduler stores the session it is given and returns it from getTask, but the delayed run invokes the RPC with no session
- [Can a user id containing a colon read another user's credentials?](does-a-user-id-with-a-colon-read-another-users-credentials.md) — LocalCredentialService joins user id and name with a colon and matches users by prefix, so an id containing a colon may collide with another user's keys
- [Does a wireCLI command need a session when it sets no auth?](does-a-wirecli-command-need-a-session-by-default.md) — The channel default is documented as requiring a session, but a CLI command has no default of its own; its session need comes from whether the function is sessionless
- [Does an adversarial user's in-scope success count as a finding?](does-an-adversarial-in-scope-success-count-as-a-finding.md) — The disposition doc says a 2xx is a finding for an inverted oracle, but the engine only flags successes outside the virtual user's scopes, and in-scope 2xx depends on the app's classifier
- [Does approveStep need the run owner's session, as its doc says, or only what the gate's approvers policy allows?](does-approve-step-need-the-run-owners-session-or-the-gates-approvers.md) — The WorkflowService doc says the session must belong to the run's owner, but the implementation judges the session against the gate's published policy, whose default is any
- [Does cors origin: true reflect any origin when credentials are on?](does-cors-origin-true-reflect-any-origin-with-credentials.md) — The credentials guard only refuses the wildcard origin, so origin: true with credentials reflects whichever origin asks
- [Does skipUserSession do anything on a channel?](does-skip-user-session-do-anything-on-a-channel.md) — The local channel runner accepts and forwards skipUserSession, but the channel open path never reads it, unlike the HTTP runner which refuses it on a session-requiring route
- [Should betterAuthStoreSession warn about unhonoured impersonation?](does-the-store-session-match-the-other-two.md) — The cookie and stateless middlewares warn once when the impersonation header is ignored; the store middleware does not, and nothing says whether that is an omission
- [Is the agent score worker reachable without a session?](is-the-agent-score-worker-reachable-without-a-session.md) — The score worker is registered as sessionless with the helper function type, and this file wires no route or expose for it
- [May a scheduled test on live change data?](live-scheduled-tests-may-write.md) — Scheduled runs against a live app may only read, or may write with an explicit per-schedule approval; the choice is not made
- [Who calls provisionVirtualUsers?](provision-virtual-users-has-no-caller-in-this-repo.md) — provisionVirtualUsers is additive and can ban orphans, but no caller exists in this repo outside tests and skill docs, and the route its doc comment names no longer exists
- [Does a non-mesh request need a mesh token once the secret is set?](mesh-secret-refuses-requests-without-a-mesh-token-on-every-path.md) — With PIKKU_MESH_SECRET set, pikkuMeshAuthMiddleware refuses any request lacking a Bearer header, not only /mesh/rpc paths; the no-secret branch is path-scoped
- [Should a scoped secret view throw from hasSecret for a disallowed key?](should-a-scoped-secret-view-throw-from-has-secret-for-a-disallowed-key.md) — The SecretService contract says hasSecret answers for any key and must not throw, but the scoped view throws for keys outside its set
- [Should a Bearer token that does not verify be anonymous or refused?](should-a-wrong-bearer-token-be-anonymous-or-refused.md) — authBearer refuses a malformed scheme with InvalidSessionError but lets a well-formed wrong token through as anonymous, and no comment says why
- [Should an outgoing webhook go out unsigned when its configured signing secret resolves empty?](should-an-empty-webhook-signing-secret-send-unsigned.md) — When config.webhook.secret names a secret that resolves to nothing, the delivery is logged as unsigned and enqueued without a signature
- [Should HTTP virtual user sessions reset between scenarios in one CLI run?](should-http-virtual-user-sessions-reset-between-scenarios-in-one-run.md) — The CLI builds HTTP virtual users once and reuses them for every scenario, and only the browser side is reset between scenarios
- [Should the scenario cookie jar scope cookies to the API origin?](should-the-cookie-jar-scope-cookies-to-the-api-origin.md) — createCookieJar sends every held cookie to whatever URL it is given, keeps only name and value from Set-Cookie, and stamps the API origin on all calls
- [Should voiceInput fetch audio URLs when no host allowlist is configured?](should-voice-input-fetch-audio-urls-without-a-host-allowlist.md) — With no allowedAudioHosts, the audio URL is fetched through safeFetch with no allowlist, so any public host is reachable
- [What rules govern impersonation on staging and live?](staging-impersonation-rules.md) — Staged impersonation by a signed-in admin is wanted; the switch, read-only default, expiry and logging rules are proposed but not agreed
- [An unauthorized channel reply is sent outside the channel's declared Out type](unauthorized-channel-replies-escape-the-declared-out-type.md) — processMessageHandlers sends a bare string on auth failure, which no generated client type admits — nobody has decided what the typed shape should be
- [Pikku Studio Cloud has to create, hold and deliver the stage virtual user keys](virtual-user-keys-on-cloud-stages-are-pikku-studios-to-build.md) — This repo defines the variables and verifies statements; generating a pair per stage and signing for stage callers is Pikku Studio Cloud work that has not been done or checked
- [A virtual user statement can be replayed once per instance](virtual-user-statement-replay-is-per-process.md) — The one-time id store is an in-memory map, so on several instances or Worker isolates each accepts a statement once
- [What should an impersonated session carry?](what-an-impersonated-session-carries.md) — An impersonated session without a mapSession is just { userId }, dropping the orgId and virtualUser fields a normal session has; nobody has said whether that is intended

<!-- /pikku:knowledge-index -->
