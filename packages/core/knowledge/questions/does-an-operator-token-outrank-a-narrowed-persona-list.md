---
type: question
title: Does an operator token outrank a narrowed PIKKU_PERSONA_SECRETS list?
description: resolvePersonaCredentials prefers FABRIC_OPERATOR_TOKEN over PIKKU_PERSONA_SECRETS, so a run given only some personas can act as any persona when both are set
tags: core, cli, personas, sign-in
---

# Does an operator token outrank a narrowed PIKKU_PERSONA_SECRETS list?

`resolvePersonaCredentials` in `packages/cli/src/utils/persona-credentials.ts`
checks the operator token before `PIKKU_PERSONA_SECRETS`. Its doc comment says an
operator token "wins when both are present" because it is the stronger credential
and "a run that could use either should not fall back to the weaker one".

The constant's doc comment says the opposite about the list: it is what a run is
given "when it should be able to sign in as some personas and not the rest", and
"the list is the whole of what this run can be". The narrowing is also described
in
[A persona credential is derived per persona](../decisions/security/an-actor-credential-is-derived-per-persona.md),
which says a run given the list "can sign in as those only".

With both variables set, the operator token is used and the list is ignored, so
the run can act as any persona on the stage. Neither comment mentions this case.

What is asked: when an operator asks for a restricted run by setting the list,
should the list win over a token that is also present, or should the token win
and the list be treated as advisory?
