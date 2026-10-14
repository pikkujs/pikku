---
type: question
title: Does a wired persona sign-in leave the operator token and secret unread, or refuse them?
description: The wirePersonaSignIn doc says the operator token and actor secret are not read at all when the hook is set, but HttpPersona throws when either is set alongside it
tags: personas, sign-in, comment-vs-code
---

# Does a wired persona sign-in leave the operator token and secret unread, or refuse them?

**The comment.** `wirePersonaSignIn` in `packages/core/src/wirings/persona/wire-persona-sign-in.ts` is documented
(lines 4-10) as the one registration for every consumer that signs a persona in. Lines 9-10 say: "When it is set
the operator token and the actor secret are not read at all." The file is in `packages/core`, not the CLI.

**The code.** The `HttpPersona` constructor in `packages/core/src/services/http-personas.ts` asks
`getWiredPersonaSignIn()` (line 174). When a hook is wired it collects whichever of `secret` and `operator` are
set in the config (lines 175-177). If any are, it throws a `PikkuError`: "a PersonaSignIn is wired with
wirePersonaSignIn, which replaces ${clashing} — set exactly one way to sign in" (lines 178-183). Only then does it
build the hook's sign-in (line 184). The config doc agrees with the code, not the comment: `secret` is "Refused
alongside a sign-in registered with `wirePersonaSignIn`" (lines 57-58).

So the credentials are read by the caller and then refused, not left unread. The runtime path avoids the throw by
omitting `secret` when a hook is wired (`packages/core/src/wirings/workflow/pikku-scenario-service.ts:678-681`,
`:706`), see
[should-a-run-without-actors-use-the-cli-credential-order](./should-a-run-without-actors-use-the-cli-credential-order.md).

**Question:** is the intended contract "set the hook and nothing else", with the thrown error as the guard, in which
case the comment at `wire-persona-sign-in.ts:9-10` should say credentials are refused, or should a caller holding
both be allowed to proceed with the hook and the extra credentials ignored, as the comment says?
