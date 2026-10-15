---
type: decision
title: An addon secret read the inspector cannot resolve is absent from the package
description: The package generator builds the declared secret set from definitions and resolved usage keys, so a computed secret id is missing unless the addon sets globalSecrets
tags: cli, addons, secrets
---

# An addon secret read the inspector cannot resolve is absent from the package

`packages/cli/src/functions/wirings/package/pikku-command-package.ts` builds the credential
metadata for an addon package from the state's credential definitions
(`pikku-command-package.ts:47-56`). The declared secret set is built from the secret
definitions and from the keys of each resolved usage (`pikku-command-package.ts:60-68`).

The comment at `pikku-command-package.ts:58-59` says a secret read the inspector cannot resolve
to a literal is absent by construction, and that such an addon needs `globalSecrets` on its
`wireAddon`.

**What this rules out:** assuming a secret whose id is computed at runtime will be declared
automatically. It is absent from the set unless the addon opts into `globalSecrets`.
