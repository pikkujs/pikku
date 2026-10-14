---
type: decision
title: The actor sign-in gate stays shut unless dev or the exact opt-in value is set
description: Passwordless actor sign-in opens only under pikku dev or when PIKKU_ALLOW_ACTOR_SIGN_IN holds the one exact value, and a near-miss value is warned about without being echoed
tags: better-auth, actor, sign-in, configuration
---

# The actor sign-in gate stays shut unless dev or the exact opt-in value is set

`resolveActorSignIn` (`actor-sign-in-gate.ts`) decides whether `/sign-in/actor`
and the persona endpoints are served. It returns one of three outcomes:

- `PIKKU_ALLOW_ACTOR_SIGN_IN` equals `passwordless-actor-sign-in` (reason
  `allow-outside-dev-env`). This is the only value that opens it outside dev.
- `PIKKU_DEV_ACTOR_SIGN_IN` equals `true` (reason `pikku-dev`). The CLI sets this in
  `pikku dev`.
- Anything else is disabled, and the endpoint refuses with a generic message.

Rules that go with the gate:

- **Exact value only.** Any other value is a near-miss. It is ignored, and a warning
  says so. The warning does not repeat the value, because an operator may have
  pasted a secret into it.
- **Refusal is logged once.** A sign-in attempt on a closed gate logs one warning
  naming the opt-in, then stays quiet.
- **Passed in or read from env.** `pikkuActor({ allowSignIn })` can hand the value
  in directly. The comment says a Cloudflare Worker gets it as a binding, and
  `process.env` is not populated there.

**What this rules out:** any truthy value opening passwordless sign-in, and echoing
the opt-in value into logs.
