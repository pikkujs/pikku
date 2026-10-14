---
type: decision
title: A second install of the same addon namespaces its secret, variable and credential names
description: install-addon derives per-instance overrides only when the package is already wired, prefixing env-style secret and variable names with the namespace and prefixing credential names with it
tags: console, addons, secrets, credentials
---

# A second install of the same addon namespaces its secret, variable and credential names

`install-addon.function.ts` (`packages/addon/pikku-console/src/functions/install-addon.function.ts`)
checks `packageIsAlreadyWired` (`install-addon.function.ts:103-108`). Only when that
is true does it call `deriveInstanceOverrides`, with the names the package declares
(`install-addon.function.ts:109-115`). Otherwise the overrides are `{}`, so the first
instance keeps the package's logical names. The comment says so
(`install-addon.function.ts:98-102`).

`deriveInstanceOverrides` (`packages/addon/pikku-console/src/lib/derive-instance-overrides.ts:76`)
builds three maps:

- `secretOverrides` and `variableOverrides` use `scopedEnvName`
  (`derive-instance-overrides.ts:84-93`). It produces `<NAMESPACE>_<NAME>` and strips
  a leading package-base token, so `MANDRILL_API_KEY` under `mandrill-promo` becomes
  `MANDRILL_PROMO_API_KEY` (`derive-instance-overrides.ts:52-67`).
- `credentialOverrides` use `scopedCredentialName`, which gives `<namespace>-<key>`
  (`derive-instance-overrides.ts:70-74`, `derive-instance-overrides.ts:94-97`).

`readAddonDeclaredNames` reads the names from the package's shipped `.pikku` meta,
and treats missing meta as declaring none (`derive-instance-overrides.ts:130-137`).

The file's comment says the overrides are a default the user may edit or drop, and
that the runtime and inspector treat them as optional (`derive-instance-overrides.ts:23-25`).

**What this rules out:** namespaced names on the first install of a package, and
treating these overrides as required.
