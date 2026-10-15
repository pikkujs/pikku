---
type: decision
title: Each distinct n8n credential becomes one addon instance, and nodes that share it share that instance
description: Credential instances are deduplicated by credential type and id or name, and each node is bound to the first instance that matches it
tags: [n8n, credentials, addons]
---

# Each distinct n8n credential becomes one addon instance, and nodes that share it share that instance

`deriveCredentialInstances` in `packages/n8n-import/src/credentials.ts` keys each credential by
`dedupeKey(credType, ref)` (line 117). `dedupeKey` returns `<type>:<id or name or 'default'>` (lines 81-86).
A node that uses a key already seen is added to that instance's `nodeRpcNames` (lines 119-123). A new key
creates an instance (lines 137-146), and a clashing instance name gets a numeric suffix (lines 128-134).

`nodeInstanceBindings` (lines 154-163) maps each node's RPC name to the first instance that lists it.

The comment at `packages/n8n-import/src/codegen.ts` lines 60-61 says the instances are "one per distinct
n8n credential". The `ManifestEntry.credentialInstance` field (lines 49-51) carries the binding, and
`codegen.ts:1682` fills it from `bindings`. The `wireAddon` emission comment at lines 1416-1419 says each
instance is "bound to its own credential via `credentialOverrides`".

**What this rules out:** two nodes that use the same n8n credential being bound to two addon instances. Two
credentials of the same type get two instances.
