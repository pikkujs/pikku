---
'@pikku/core': patch
'@pikku/cli': patch
---

Print a CLI failure as its message, not as a JS stack trace.

Every error that reached the top of `executeCLI` was logged with `console.error('Error:', error)`, which node renders as the full stack — and prefixed it a second time, so a refusal read `Error: Error: Persona 'guest' missing guest…` above ten frames of pikku internals. A `PikkuFetchError` was worse: node inspects an error's own properties, so the whole `Response` came out with it, headers and body stream included, to say `502`.

An expected failure — a `PikkuError`, or anything carrying `expected: true` — now prints its message alone, and a fetch failure prints `502 Bad Gateway from <url>` without touching the response. Anything else keeps its stack, because a `TypeError` with its frames removed is undiagnosable. `--verbose`/`-v`, or `PIKKU_DEBUG=1` where the flag cannot be typed, adds the stack back to an expected failure.

The refusals behind the examples — a persona whose roles have drifted, a sign-in the stage rejected — are raised as `PikkuError` so they are classed as deliberate.
