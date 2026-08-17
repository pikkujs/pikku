---
type: decision
title: Scenario steps default to no retries, and a whole poll is one durable step
description: Retrying a failed assertion is wrong for a test primitive; recording the poll as one step means replay returns the outcome, not the loop
tags: workflow
---

# Scenario steps default to no retries, and a whole poll is one durable step

`ScenarioStepOptions.retries` defaults to 0, unlike an ordinary workflow step
which inherits `DEFAULT_STEP_RETRIES`. `PikkuScenarioService.scenarioStep`
applies that default explicitly (`options?.retries ?? 0`). Retrying a failed
assertion is the wrong behaviour for a test primitive: it converts a real
failure into a slow flake and hides the very race the scenario was written to
catch.

`expectEventually` is the sanctioned way to wait. The entire poll — invoke,
check the predicate, sleep, repeat until `within` elapses — runs inside a single
`inlineStep`, so it is ONE recorded step and a replay returns the cached
outcome rather than re-polling. `expectError` and `expectService` are the same
shape: one durable step whose body contains the whole assertion, with a failure
message that names the step, the target, and what was actually seen.

`pollUntil` in `scenario-poll.ts` is the step-level equivalent, and its
`undefined` convention is deliberate: `undefined` means "not yet" and nothing
else, because `false`, `0` and `''` are all real answers — a probe asking
whether something happened reports `false` when it did not. It returns
`undefined` at the deadline rather than throwing, leaving the error to the
caller, who is the only one who knows what was being waited for. Its own
defaults are shorter than the assertion wrappers': `within` 15s, `interval`
250ms.

`requireScenarioEnv` (`scenario-step-guards.ts`) exists for the mirror-image
reason: `env` is optional on the step wire because most steps need nothing from
it, so the narrowing happens in one place with a message that says what to do,
instead of every step file writing its own guard. The actor is not narrowed at
all — a step that runs as somebody declares `actor: true` (or a `browser`
binding, which cannot be provisioned without a window to open), and the runner
injects `wire.actor` non-optionally into every binding and refuses to dispatch
the step without one. A wire member can be required per binding; a property of
one cannot, which is why it is not on `scenarioStep`. `scenarioStep`'s `verifyStepName` call doubles as the guard for `then`
being a wire member — an accidental `await scenario` calls it with a resolve
function, which lands as a loud named error instead of a silent hang.

The assertion options are lenient by design so a scenario reads as intent
rather than as an exact-match harness: `matches` is a substring test when it is
a string and a full match only when it is a `RegExp`; `calledWith` deep-equals
the first argument only; `times` means at-least-once unless a count is given;
`within` defaults to `'30s'` and `interval` to `'1s'`.

**What this rules out:** giving scenario steps the workflow retry default,
recording each poll iteration as its own step, treating a falsy `pollUntil`
result as "not yet", making `pollUntil` throw on timeout, or narrowing `actor`
by hand inside individual step files.
