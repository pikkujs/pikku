---
type: decision
title: Azure local settings carry empty placeholders for secrets, never their values
description: generateLocalSettings writes every secret and variable as an empty string, so local.settings.json holds no secret values
tags: [deploy, azure, secrets]
---

# Azure local settings carry empty placeholders for secrets, never their values

`generateLocalSettings` in `packages/deploy/deploy-azure/src/host-json.ts` builds the `Values`
map of `local.settings.json`. It sets `AzureWebJobsStorage` to the development-storage
string and `FUNCTIONS_WORKER_RUNTIME` to `node` (lines 43-46).

For each secret it sets the key to `''` (lines 48-50). For each variable it also sets
`''` (lines 51-53). The secret and variable arguments are typed as `{ secretId }` and
`{ variableId }`, so the function has no value to write.

The doc comment says the file "contains environment variables and connection strings"
(lines 36-37). The secret values are not in it.

**What this rules out:** a secret's value appearing in the generated local settings file.
Variables are blanked the same way.
