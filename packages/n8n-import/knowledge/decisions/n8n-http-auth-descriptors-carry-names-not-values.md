---
type: decision
title: An n8n HTTP auth descriptor carries secret names and constants, never secret values
description: HttpAuthDescriptor holds the credential name and static fields, and the secret is read from the SecretService at request time
tags: [n8n, secrets, http]
---

# An n8n HTTP auth descriptor carries secret names and constants, never secret values

`HttpAuthDescriptor` in `packages/n8n-import/src/types.ts` is documented at lines 84-90. It "carries only NAMES
and static constants — never the secret value", so it is safe to serialise into the node's declarative input,
which "is persisted to durable step state". "The function resolves the actual secret at request time via the
SecretService."

The interface (lines 91-95) has `mode`, a `credential` field described as "Secret KEY the value is provisioned
under (out of band)" (line 93), and static fields such as the header name for `apiKeyHeader` (line 95).

**What this rules out:** a secret value written into a node's persisted input. The descriptor can be stored in step
state because it holds no value.
