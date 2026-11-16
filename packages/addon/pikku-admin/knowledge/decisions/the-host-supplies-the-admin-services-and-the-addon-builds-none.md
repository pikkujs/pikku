---
type: decision
title: The host supplies the admin services and the addon builds none of them
description: services.ts forwards the scope, credential, audit, auth, flag and trigger stores from the host, and constructs nothing, so the addon cannot run its own audit sink or scope service
tags: admin, services, wiring
---

# The host supplies the admin services and the addon builds none of them

`packages/addon/pikku-admin/src/services.ts:12-31` takes six singleton services from
the host (`scopeService`, `credentialService`, `audit`, `auth`, `featureFlags`,
`triggerSourceStore`) and returns them unchanged. Nothing in the file constructs a
service.

The file's comment gives the reason (`services.ts:3-6`). An addon that made its own
`audit` sink would read a trail nobody writes to, and its own `scopeService` would
grant roles nothing checks. The comment says these are "the application's choice."

Lines 8-10 record a second property: nothing here touches a filesystem or a project
root. That is what lets this addon run in a deployed serverless unit, which the
comment contrasts with `@pikku/addon-console`.

`secrets`, `variables` and the optional `metaService` are forwarded the same way, for the
secret, variable and installed-addon functions. The one exception is `secretAdminService`:
a thin wrapper over the host's `secrets`, built in `services.ts` because the function
runner withholds `secrets` from functions (see
[admin secret plaintext](admin-secret-plaintext-is-revealed-in-one-place.md)). It holds no
store and no sink, so it does not break the rule against an addon-owned audit sink or scope service.

**What this rules out:** an addon-owned audit sink or scope service, and a
filesystem dependency in these singleton services.
