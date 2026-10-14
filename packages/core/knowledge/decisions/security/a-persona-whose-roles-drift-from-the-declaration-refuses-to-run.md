---
type: decision
title: A persona whose granted roles drift from its declaration refuses to run
description: verifyPersonaRoles compares declared and granted roles in both directions before a run, and roleMismatchMessage produces the refusal text; a provider login is never runnable
tags: core, personas, roles, drift
---

# A persona whose granted roles drift from its declaration refuses to run

`packages/core/src/wirings/persona/validate-personas.ts` has the role check that
runs before a persona's first step. `verifyPersonaRoles` computes what is missing
and what is extra, in both directions (`validate-personas.ts:94-111`). `roleMismatchMessage`
returns `null` when they match, and otherwise a message that ends with "Refusing
to run" (`validate-personas.ts:114-133`, the text at `validate-personas.ts:131`).

The doc comment says the declaration is authoritative, but a run may target a
stage that the generated seed never touched (`validate-personas.ts:84-87`). It
gives a reason for each direction: an under-granted persona reports seed drift
as an authorization bug, and an over-granted one "silently stops testing the
boundary it was written to test" (`validate-personas.ts:89-92`).

Nothing in `packages/core/src` calls `roleMismatchMessage`. The caller that
stops the run is outside this package, so this file only supplies the check and
the message.

`isRunnablePersona` (`validate-personas.ts:19-27`) returns false for a persona
with `runnable: false`, and for any persona with an account provider, because
driving a provider consent screen "needs a human" (`validate-personas.ts:10-12`).

**What this rules out:** running a virtual user whose roles no longer match what
it declared, and a provider-login persona being driven by a run.
