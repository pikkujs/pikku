---
type: decision
title: A secret may only be sent to the hosts its declaration names
description: assertSecretAllowedForHost refuses a host outside a secret's allowedHosts, and refuses any host at all for a secret with no allowedHosts when the project requires them
tags: core, secrets, egress
---

# A secret may only be sent to the hosts its declaration names

`packages/core/src/services/secret-host-binding.ts` holds the check
`assertSecretAllowedForHost`. It looks up the secret's definition by id and reads
its `allowedHosts`.

- No `allowedHosts`, and `requireAllowedHosts` is set: throw.
- No `allowedHosts`, and the flag is not set: allowed.
- `allowedHosts` present: the host must match at least one entry, or throw.

Matching is `hostMatches` from `packages/core/src/utils/host-match.ts`, the same
matcher `safeFetch` uses. It is case-insensitive. An entry is an exact host, a
`host:port`, or a single leading `*.` wildcard with at least two labels after
it. The wildcard requires a non-empty label before the dot, so `*.example.com`
does not match `example.com` itself, and it never matches an IP literal. An
entry `validateHostPattern` refuses (`*.com`, a URL with a scheme) matches
nothing.

The error message tells the author to add the host to `allowedHosts` on the
`defineSecret` if the send is intended.

**What this rules out:** sending a secret to a host its declaration does not
name, and a bare-domain match against a wildcard entry.
