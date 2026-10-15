---
type: decision
title: An addon instance reads only the secrets and credentials it is named
description: An addon's secret and credential views are its declared names plus the consuming app's grants and override keys; the global flags opt out of scoping
tags: core, addons, secrets, credentials
---

# An addon instance reads only the secrets and credentials it is named

The consuming app decides which secrets and credentials an addon instance may
read. The grant fields are declared on the wiring as "set by the consuming app"
(`packages/core/src/wirings/rpc/rpc-types.ts:73-76`) and carried through
`wireAddon` (`packages/core/src/wirings/addon/wire-addon.ts:123-126`) into the
instance (`packages/core/src/wirings/addon/addon-runner.ts:20-22`).

The allowed set is built by `allowedNames` in `addon-runner.ts:40-49`: the names
the package declared, plus the grants, plus the keys of the overrides. An
override key therefore grants the name; the override value is the key the
lookup is pointed at. `wire-addon.ts:71` says the grant check runs before
`secretOverrides` rename a name.

Scoping is applied when the instance's services are built
(`addon-runner.ts:200-227`). Unless `globalSecrets` is set, the secret service
is wrapped in `ScopedSecretService`; unless `globalCredentials` is set, the
credential service is wrapped in `ScopedCredentialService`. The global options
hand over the unscoped service, and their value is a reason string
(`wire-addon.ts:75-82`). The comments say the reason is recorded in the deploy
manifest; that recording was not traced here.

**What this rules out:** an addon reading a name neither it declared nor the
host named, including through an override value; and an unscoped service
reaching an addon without the consuming app setting a `globalSecrets` or
`globalCredentials` reason.
