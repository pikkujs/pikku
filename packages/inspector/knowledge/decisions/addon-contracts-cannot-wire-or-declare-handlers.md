---
type: decision
title: Addons may not call wiring helpers or declare middleware or permissions
description: Addon packages are banned from transport wirings, and their define* contracts may not carry middleware or permissions
tags: [inspector, addon]
---

# Addons may not call wiring helpers or declare middleware or permissions

`checkAddonBans` in `packages/inspector/src/add/add-addon-bans.ts` runs only when the
package is inspected as an addon (line 63). It enforces two rules.

- A call to any name in `BANNED_WIRINGS` is critical `ADDON_WIRING_NOT_ALLOWED`
  (lines 10-24, 68-74). The list includes `wireAddon`, `wireRemoteAddon`, `wireHTTP`
  and `wireChannel`.
- A `defineHTTPRoutes`, `defineChannelRoutes` or `defineCLICommands` call whose
  first argument has a `middleware` or `permissions` property is critical
  `ADDON_CONTRACT_HANDLERS_NOT_ALLOWED` (lines 26-30, 32-49, 76-83).

The file comment (lines 6-8) says addons "declare contracts with the define*
helpers and export functions", and the consuming app wires them. The comment at
lines 52-54 says middleware and permissions "are the consuming app's concern".

**What this rules out:** an addon fixing its own transports, or attaching its own
access rules to the routes it contributes.
