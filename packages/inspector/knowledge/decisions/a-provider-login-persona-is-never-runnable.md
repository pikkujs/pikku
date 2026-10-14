---
type: decision
title: A provider-login persona is never runnable, even when declared runnable
description: Runnable is derived from the account, so a persona with a provider login cannot be driven, and an explicit runnable true does not change that
tags: [inspector, personas, virtual-users]
---

# A provider-login persona is never runnable, even when declared runnable

`addPersonas` in `packages/inspector/src/add/add-personas.ts` sets `runnable` through
`isRunnablePersona`, passing the declared `runnable` value and the account (lines
243-256). It imports the function from `@pikku/core/persona` (line 3).

The function is in `packages/core/src/wirings/persona/validate-personas.ts`. An
explicit `runnable: false` gives false (lines 23-25). Otherwise the result is
`account?.provider === undefined` (line 26). A declared `runnable: true` does not
override the provider check, so a provider account is never runnable.
`packages/core/src/wirings/persona/persona.test.ts:89-91` covers the provider case.

The doc comment gives the reason (validate-personas.ts:7-17). Driving a provider's
consent screen needs a human, so this is "a property of the account rather than a
decision anyone should have to remember to record". An explicit `false` marks a
persona that is only ever acted on.

**What this rules out:** a provider-login persona being driven by a virtual user,
whatever the declaration says.
