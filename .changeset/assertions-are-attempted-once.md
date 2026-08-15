---
'@pikku/core': patch
---

fix(core): a scenario assertion is attempted once, not six times

`given`, `when` and `then` already opted out of the workflow-wide retry
default, with a comment saying why: retrying a failed assertion is the wrong
behaviour for a test primitive. The `expect*` family did not. It passed its
options straight through to the step engine and inherited
`DEFAULT_STEP_RETRIES`, so every `expectError`, `expectService`,
`expectEventually` and `expectScore` got six attempts.

What that buys is not resilience:

- `expectError` re-invokes the RPC it is asserting against, five more times,
  after it has already done the thing it was not supposed to do.
- `expectEventually` restarts a poll that has already spent its own `within`
  deadline, so a 30s bound is really 3 minutes.
- `expectScore` re-runs an LLM judge until a grade lands inside the band. That
  is the one that found this: a judge scored a deliberately useless answer a
  full 1, and the scenario went green on the next attempt.

An assertion now defaults to `retries: 0` like every other scenario step, and
a caller that genuinely wants attempts still asks for them. The unit tests for
these helpers had each been passing `retries: 0` by hand to make a failure fail
promptly; those workarounds are gone.

A scenario that was only passing because an assertion was retried will now
report it.
