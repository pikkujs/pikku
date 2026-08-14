---
type: decision
title: The console addon's privileged functions gate themselves
description: Thread listing is owner-scoped unless the caller holds admin, and addon installation requires an admin session, rather than trusting the host to register a global permission
tags: addon, agent, rpc
---

# The console addon's privileged functions gate themselves

`@pikku/addon-console` is wired into the consuming application by the generated
`console.gen.ts` that `scaffold.console` produces — `wireAddon({ name:
'console', package: '@pikku/addon-console' })`. That file is compiled into the
app and ships wherever the app ships, so every `expose: true` console function
is reachable over the app's own `POST /rpc/:rpcName` route in production, not
only from `pikku dev`. `pikku serve --console` binds `127.0.0.1` and adds a
static SPA mount; it wires no functions. The console UI being a development tool
is a convention about who opens the browser tab; it is not a deployment
boundary.

The transport in front of that route is configured separately from the console:
`scaffold.rpc` defaults to `"no-auth"` in `templates/functions/pikku.config.json`
and in `e2e/pikku.config.json`, which generates `wireHTTP({ route:
'/rpc/:rpcName', auth: false })`. `scaffold.console: "auth"` does not raise it,
and the generated `wireAddon` carries no `auth` key, so `addonConfig.auth` is
undefined at the addon boundary too. The remaining session check is the function
runner's, which for a `pikkuSessionlessFunc` fires only when the function itself
sets `auth: true`.

The addon's original authorization story was a single package-scoped
`addGlobalPermission([isAdmin], '@pikku/addon-console')` that the _host_
registered, which `runPermissions` resolves in the callee's package namespace and
applies to every function at once. Nothing generated that call — the scaffold
emitted only a comment recommending it, and `resolveGlobalPermissions` returns an
empty list when the host registered none, which `runPermissions` treats as
allow. An app that followed the scaffold and stopped there had a fully open
console surface. Every console function now declares its own
`pikku:console:<area>:<action>` scope instead, which the function runner
enforces per call. A blanket `wireAddon({ …, scopes: ['admin'] })` stood in for
that briefly; it is gone, because a single grant covering secrets, source
editing and the audit trail alike is not something an operator can reason
about.

The two functions whose failure mode is worst still do not depend on any
package-wide gate:

`getAgentThreads` derives `owners` from the session with core's
`threadOwnerConstraint` and passes it on every call, omitting it only when the
session holds the `admin` scope root — listing every thread is the legitimate
purpose of an admin console, and `hasScopes` accepts the umbrella grant and its
wildcards. The `owners` value is never read from input, so a caller cannot name
someone else's principal. A session with no principal yields `[]`, which every
storage backend already treats as no rows.

`installAddon` and `installOpenapiAddon` run a package manager against an
attacker-chosen package name and write a wiring file into the project. They were
`pikkuSessionlessFunc` with `auth: false`, which — behind a `no-auth` RPC route
and with no host global permission — meant an unauthenticated POST reached
`execFileSync`. They now declare `auth: true` and
`scopes: ['pikku:console:addons:install']`, enforced by `verifyScopes` in the
function runner before the body runs. Both gates are
checked whether or not the host registered a global permission — an app that
hand-wires `wireAddon({ name: 'console', package: '@pikku/addon-console' })`
still cannot reach `execFileSync` unauthenticated.

The scopes are spelled as literals here because they are scope ids in the
addon's own `wireScope` tree — the same tree the `pikku:console:scopes:*` gates
on the scope-admin functions come from. The generated secret and variable
brokers live in the app's own scaffold rather than the addon, so the addon
boundary never covered them; they carry `pikku:console:secrets:*` and
`pikku:console:variables:*` themselves.

**What this rules out:** treating the host's `addGlobalPermission` as the only
gate in front of an operation that installs code or reads another principal's
data; deriving `owners` from request input; returning `owners: undefined` for a
caller who simply has no principal; and gating these functions on a
`metaService.basePath` check — that is a filesystem-availability test which the
generated `PikkuMetaService` satisfies in any unbundled Node deployment, not an
is-this-localhost test.

See [[addon-scopes-are-resolved-where-the-function-runs]],
[[an-empty-owners-constraint-matches-nothing]],
[[agent-sessionless-deployments-have-no-thread-ownership]] and
[[global-permissions-and-function-permissions-are-independent-gates]].
