---
type: decision
title: Feature flag reads degrade to read-only for provider-backed sources
description: flag-list is gated by admin:flags:read and returns a read-only listing, rather than failing, when the wired flag service is a third-party provider
tags: admin, flags, scopes
---

# Feature flag reads degrade to read-only for provider-backed sources

`flag-list.function.ts:17` declares `scopes: ['admin:flags:read']`, the read half
of the flags tree (`packages/addon/pikku-admin/src/scopes.ts:57-61`).

The function has three outcomes, in this order:

- A store that can be written to (`asFlagStore`) returns its rows with
  `writable: true` (`flag-list.function.ts:19-27`).
- No flag service at all returns an empty list with `writable: false`
  (`flag-list.function.ts:30-32`).
- A provider-backed source returns its snapshot with `writable: false`
  (`flag-list.function.ts:34-43`).

The comment at lines 34-36 gives the reason for the third case: the provider's own
UI is the operator surface, and "a console of switches that 500 is worse than a tab
that reads."

The write functions refuse the same two configurations with different messages.
`packages/addon/pikku-admin/src/lib/require-flag-store.ts:14-24` throws one message
when no flag service is wired and another when the wired service is read-only, so
a caller can tell a missing wiring from a provider that owns its switches.

**What this rules out:** a 500 from the flag list when a third-party provider is
wired, and a switch being accepted for a flag the provider owns.
