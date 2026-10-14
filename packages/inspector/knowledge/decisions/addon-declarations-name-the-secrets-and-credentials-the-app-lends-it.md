---
type: decision
title: An addon declaration names the secrets and credentials the app lends it
description: secretGrants and credentialGrants are declared on the addon instance as lists of names the addon reads
tags: [inspector, addons, grants]
---

# An addon declaration names the secrets and credentials the app lends it

The addon declaration type in `packages/inspector/src/types.ts` has `secretGrants?: string[]` and
`credentialGrants?: string[]`, each commented as the secrets or credentials "the app lends this
instance, named as the addon reads them" (lines 757-760).

In `packages/inspector/src/add/add-wire-addon.ts`, those two properties are read with
`parseStringArray` (lines 212-215). The helper itself is not read here, so this note does not say how
it treats a non-literal entry.

**What this rules out:** an addon instance receiving secrets or credentials that the app did not name in
its `wireAddon` call. The names are the grant.
