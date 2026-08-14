---
'@pikku/cli': patch
'@pikku/inspector': patch
---

feat(cli): warn before codegen when a linked dependency splits a package's type identity

`pikku all` now runs the split-type-identity check as a preflight, beside the
existing `@pikku/core` one, and warns with `PKU719` naming each package, both
versions and both paths.

It has to run *before* the work rather than after it fails. The failure it
explains is a V8 heap OOM, which aborts the process — `process.on('exit')`,
`uncaughtException` and `finally` never run, so nothing printed after the fact is
ever seen. By the time there is a symptom, the only thing that can help is
already on screen above it. Without this the user sees a codegen step that dies
of memory pressure with no indication that two copies of one package are the
reason, and the obvious next move is to raise `--max-old-space-size`, which
hides it further.

Warns rather than throws: a skewed linked dependency is a strong signal, not a
certainty, and refusing to build on a heuristic would break working setups.
`PIKKU_SKIP_TYPE_IDENTITY_CHECK=1` silences it, matching
`PIKKU_ALLOW_DUPLICATE_CORE`. It also swallows its own errors — it runs on every
codegen, so it must never be the reason a build stops.
