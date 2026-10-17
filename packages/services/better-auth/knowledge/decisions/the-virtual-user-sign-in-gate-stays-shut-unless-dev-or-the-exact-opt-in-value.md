---
type: decision
title: The virtual user sign-in gate stays shut unless dev or the exact opt-in value is set
description: Virtual user sign-in opens only under pikku dev or when PIKKU_ALLOW_VIRTUAL_USER_SIGN_IN holds the one exact value, a near-miss value is warned about without being echoed, and a shut gate registers no sign-in endpoint
tags: better-auth, virtual-users, sign-in, configuration
---

# The virtual user sign-in gate stays shut unless dev or the exact opt-in value is set

`resolveVirtualUserSignIn` (`virtual-user-sign-in-gate.ts`) decides whether
`pikkuVirtualUser` registers its sign-in endpoints. It returns one of three
outcomes:

- `PIKKU_ALLOW_VIRTUAL_USER_SIGN_IN` equals `passwordless-virtual-user-sign-in`
  (reason `allow-outside-dev-env`). This is the only value that opens it outside
  dev.
- `PIKKU_DEV_VIRTUAL_USER_SIGN_IN` equals `true` (reason `pikku-dev`). The CLI sets
  this in `pikku dev`. It counts only when `NODE_ENV` is not `production`, the
  same guard dev quick login has: a deploy that inherited the dev environment is
  not `pikku dev`, and must not get statement-free switching or new virtual user
  rows from it.
- Anything else is disabled.

Rules that go with the gate:

- **Exact value only.** Any other value is a near-miss. It is ignored, and a warning
  says so. The warning does not repeat the value, because an operator may have
  pasted a secret into it.
- **A shut gate has no route.** With the gate disabled the plugin registers neither
  the server-only in-process endpoint nor `/sign-in/virtual-user`; the switch
  endpoint, when declared, refuses with `VIRTUAL_USER_SIGN_IN_DISABLED_MESSAGE`.
- **Passed in or read from env.** `pikkuVirtualUser({ allowSignIn })` can hand the
  value in directly. The comment says a Cloudflare Worker gets it as a binding, and
  `process.env` is not populated there.

An open gate is not enough for an outside caller: `/sign-in/virtual-user` exists
only when the plugin also has a statement verifier (`verifyKey`, the stage's
`VIRTUAL_USER_VERIFY_KEY`), and every request carries an Ed25519-signed statement.

**What this rules out:** any truthy value opening virtual user sign-in, and echoing
the opt-in value into logs.
