---
'@pikku/core': patch
'@pikku/cli': patch
---

fix(cli): log just the message for expected failures, keep the stack for uncaught errors

A deliberate, expected failure — e.g. `pikku all` aborting because a build gate
(blocking diagnostics) tripped — was dumping a full workflow stack trace, burying
the one line that matters. Errors are now classified: a `PikkuError` (or any error
carrying an `expected` marker) prints its message alone, while a genuinely uncaught
error still prints the full stack so it can be debugged.

- New `isExpectedError(error)` helper (exported from `@pikku/core`): true for a
  `PikkuError` or an error flagged `expected`.
- The `expected` flag is threaded through `SerializedError` and the in-memory
  workflow step store so it survives the step-boundary rehydration that strips the
  error's class.
- The CLI runner's top-level catch, the `CLILogger`, and the workflow runner's
  failure log all honour it.
- The blocking-diagnostics abort now throws a `PikkuError` subclass so it is
  treated as expected.
