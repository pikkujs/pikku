---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/kysely': patch
'@pikku/addon-admin': patch
'@pikku/better-auth': patch
'@pikku/react': patch
---

Feature flags, declared in source and resolved from two independent booleans.

`defineFeatureFlags` declares a flag the way `defineScopes` declares a scope —
the inspector collects it, the CLI emits a `FeatureFlagName` union, and a
misspelled `featureFlag:` is a type error rather than a gate that silently fails
open.

A flag answers two questions that are not the same question. `capable` comes
from the session's scopes and is per-user, advisory, and protects nothing — it
hides UI. `available` comes from one global config snapshot, is caller-blind,
and is the only half the runner enforces: `override(subject) ?? (enabled AND
bucket)`, so "off for everyone except these three organizations" is one row, and
a kill is one write rather than a fan-out. Authorization stays where it was, in
the function's own `scopes:` — enforcing capability would make a flag a second
authorization path OR-ing against them. An unavailable feature throws 503, not
403, because the caller was allowed; the feature was not on.

`featureFlag:` is deliberately available on sessionless functions too. It reads
the config, not the session, so the kill switch reaches a cron task, a queue
worker and a webhook — which is where it matters most, since nobody is watching
a UI to notice the feature is off.

Availability fails open through three layers: a fresh read, then the last good
cached read, then the compiled declaration. The middle layer is load-bearing —
dropping straight to the compiled fallback on a blip would switch on every flag
that was deliberately dark.

Backing stores split along what they can honestly do. `FeatureFlagSource` is
read-only (`snapshot()`) and is what a third-party provider implements;
`FeatureFlagStore` adds the write half and is for stores Pikku owns.
`@pikku/kysely` ships the store, with declarations synced additively — a removed
declaration is marked undeclared, never revoked, and a sync never re-enables a
killed flag. Third-party providers implement the read-only half in the addons
repository, over plain `fetch` rather than a vendor SDK — those poll on a timer
belonging to a long-lived process, which a serverless isolate cannot hold
between requests.

A client asks for its flags once per session rather than per flag:
`scaffold.featureFlags` generates a `GET /feature-flags` returning every
declared flag resolved for the caller, keyed by this app's `FeatureFlagName`.
Generated into the app rather than shipped in an addon precisely for that union
— an addon never sees the host's, and could only answer
`Record<string, boolean>`. It returns `show` alone: sending `available` apart
from `capable` would tell every visitor which features exist but are dark.

The write half is the operator's, and lives in `@pikku/addon-admin` beside the
scope RPCs, under a new `admin:flags` scope. `flagList` reports `writable:
false` rather than failing when flags come from a provider, because a provider's
own UI is its operator surface and a console full of buttons that 500 is worse
than a read-only tab. It still lists the flags: a source may report its declared
set through `declaredFlags()`, and each row carries `backed`, false where the
provider has never heard of a declared flag. That row is the one worth seeing —
an absent row fails open, so a dark launch nobody created in PostHog is already
live for everyone, and a store pikku owns can reconcile that on deploy where a
provider cannot.

On the client, `createFeatureFlags` fetches that map once and `useFeatureFlag`
reads it synchronously after, through the same provider the analytics client
hangs off. It takes a `bootstrap` map so a server-rendered page hydrates onto
the answer it already computed: without one there is a gap in which neither
default is right, since false hides a feature the user has and true flashes one
they do not. A failed refresh keeps the map already on screen rather than
relabelling every flag on a blip.
