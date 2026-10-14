---
type: decision
title: A secret may only be sent to the hosts its declaration names
description: assertSecretAllowedForHost refuses a host outside a secret's allowedHosts, and refuses any host at all for a secret with no allowedHosts when the project requires them
tags: core, secrets, egress
---

# A secret may only be sent to the hosts its declaration names

`packages/core/src/services/secret-host-binding.ts` holds the check
`assertSecretAllowedForHost`. It looks up the secret's definition by id and reads
its `allowedHosts` (`secret-host-binding.ts:36-39`).

- No `allowedHosts`, and `requireAllowedHosts` is set: throw
  (`secret-host-binding.ts:41-44`).
- No `allowedHosts`, and the flag is not set: allowed (`secret-host-binding.ts:45`).
- `allowedHosts` present: the host must match at least one entry, or throw
  (`secret-host-binding.ts:48-50`).

Matching (`secret-host-binding.ts:18-26`) is case-insensitive. An entry is either
an exact host or a single leading `*.` wildcard. The wildcard requires a
non-empty label before the dot (`secret-host-binding.ts:23`), so `*.example.com`
does not match `example.com` itself.

The error message tells the author to add the host to `allowedHosts` on the
`defineSecret` if the send is intended (`secret-host-binding.ts:11`).

**What this rules out:** sending a secret to a host its declaration does not
name, and a bare-domain match against a wildcard entry.
