---
type: decision
title: A defineProvider is a factory whose needs and provides are read from its source
description: A service destructures what it needs from services and returns what it provides, once for every target or per dev, deploy and common variant; ProviderRegistry orders them and runProviders builds them
tags: [core, provider, services, inspector]
---

# A defineProvider is a factory whose needs and provides are read from its source

`defineProvider` (`@pikku/core/provider`) declares a service. A function is
the same on every target. An object gives a `dev`, `deploy` or `common`
factory, and a target's own variant overrides `common`. A factory takes
`(services, env)`, destructures what it depends on from `services`, and returns
an object whose keys are what it provides. `onServerStart` sits on the object
form.

**Needs and provides are never declared twice.** The inspector reads the
destructured keys and the keys of the return type, so a factory must be written
inline, destructure its first parameter by plain name (no rest element, no
whole-object parameter) and return an object type with known keys. A build
cannot read anything else, which is why it fails rather than guesses.

**Resolution.** `ProviderRegistry.resolve(target, { baseline })` picks each
service's variant, rejects a key two services provide, an unmet need and a
cycle, and orders what is left so every service runs after the ones providing
what it needs. A baseline key is already held before any service runs: it meets
a need, and exactly one service may provide it, replacing it. A service cannot
need a key it provides itself.

**Running.** `runProviders` builds each service onto one `services` object
in that order and wraps a factory failure in a `ProviderError` naming the
service. It returns the `onServerStart` hooks in the same order.

**Teardown is the service's own `stop()`.** There is no stop hook.
`stopSingletonServices` calls `stop()` on every singleton service in reverse of
the order they were built, addon packages first. A service whose teardown must
come before another's builds the other first.

**What this rules out:** a second place to declare `needs` or `provides`, a
platform object a service reads facts from, and a service that silently
replaces another's key.
