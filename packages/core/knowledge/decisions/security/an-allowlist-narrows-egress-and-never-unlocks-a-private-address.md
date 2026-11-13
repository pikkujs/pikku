---
type: decision
title: An outbound allowlist narrows where a fetch may go and never unlocks a private address
description: safeFetch runs the private-address and DNS checks on every hop even when the host is in allowedHosts; only privateHosts lifts them
tags: core, ssrf, egress, security
---

# An outbound allowlist narrows where a fetch may go and never unlocks a private address

`safeFetch` (`packages/core/src/utils/safe-fetch.ts`) used to treat
`allowedHosts` as a replacement for its SSRF checks: a listed host skipped both
the private-literal check and DNS resolution. So an allowlisted public name whose
A record pointed at `10.0.0.1` or `169.254.169.254` was fetched. The allowlist is
the thing addons and apps will declare for their vendors, so it would have been
the one list that quietly disarmed the guard.

The two questions are now separate:

- `allowedHosts` answers "may this code reach this host?". It only ever narrows.
- `privateHosts` answers "may this host be, or resolve to, a private address?".
  Only a host matching it skips the private-literal and DNS checks.

A self-hosted or in-cluster target therefore needs both: in `allowedHosts` to be
reachable at all when an allowlist is set, and in `privateHosts` to be private.
`config.webhook.privateHosts` is how webhook delivery opts in. `voiceInput` has
no such option on purpose: audio from an internal host is sent inline instead.

Both lists use the shared pattern grammar in `utils/host-match.ts`
(`hostMatches`, `validateHostPattern`): `host`, `host:port`, IP literals, and one
leading `*.` with at least two labels after it, never over an IP. An invalid
entry is a `TypeError` at the call, not a pattern that silently matches nothing.
Secret host binding uses the same matcher.

Every hop, including each redirect, is checked with the same rules, and a
refusal on a redirect hop is reported with reason `redirect`. Refusals are
`NetworkHostNotAllowedError`, whose message names hosts only, never a path or
query, since those can carry tokens.

**What this rules out:** an allowlist entry that reaches an internal address by
DNS, a wildcard such as `*.com` or `*.0.0.1`, and reporting a refused URL with
its path in a log line.
