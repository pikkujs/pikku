---
type: decision
title: CLI login is the RFC 8628 device grant
description: pikku login requests a device code, shows it to the person, and polls the token endpoint; the token is enriched from get-session on a best-effort basis
tags: cli, auth, login
---

# CLI login is the RFC 8628 device grant

`deviceLogin` in `packages/cli/src/utils/device-auth.ts` runs the device
authorization flow against the server's better-auth base path. It posts to
`/device/code`, hands the user code to the caller through `onPrompt`, then polls
`/device/token` with the device-code grant type (`device-auth.ts:4-5`,
`device-auth.ts:69-87`, `device-auth.ts:93-101`).

The poll loop follows the spec's error vocabulary. `authorization_pending`
keeps polling, `slow_down` adds 5 seconds to the interval, `access_denied`
stops with a denial message, and `expired_token` ends the loop
(`device-auth.ts:109-123`). Any other error is thrown rather than retried
(`device-auth.ts:125-127`).

The token is not trusted for its metadata. `finalizeSession` takes the expiry
from `expires_in`, then calls `/get-session` with the bearer and overwrites the
expiry and user when the server returns them. A failure of that call is
swallowed and the token-derived expiry is kept (`device-auth.ts:147-173`).

**What this rules out:** a CLI that asks the person for a password, and a CLI
that reads the browser session cookie. The only thing the person does is
approve a code in a browser.
