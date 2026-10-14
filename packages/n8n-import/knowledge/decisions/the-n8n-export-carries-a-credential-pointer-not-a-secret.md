---
type: decision
title: The n8n export carries a credential pointer, not a secret, so the import provisions the name and the user fills the secret in
description: Credential derivation works from the id, name and type of a credential reference, and the secret is entered once, outside the import
tags: [n8n, credentials, import]
---

# The n8n export carries a credential pointer, not a secret, so the import provisions the name and the user fills the secret in

The header comment of `packages/n8n-import/src/credentials.ts` says the n8n export "never carries the
secret itself — only the `{ id, name, type }` pointer". So the import can "provision the instance + its
credential NAME automatically", and "the user fills the secret in once, out of band" (lines 11-13).

`deriveCredentialInstances` (lines 101-151) builds the instances from those pointers. Each instance takes
its name from `instanceNameFor` (line 127, defined at line 88), which prefers the credential name. It records the id and name from the reference (lines 141-142). No secret
value is read anywhere in the function.

**What this rules out:** the importer reading or writing a credential secret. The user supplies it after
import, under the name the import chose.
