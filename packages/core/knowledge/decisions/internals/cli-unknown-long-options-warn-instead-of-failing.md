---
type: decision
title: CLI unknown long options warn instead of failing
description: Unrecognised --long options are accepted, warned about and dropped so older binaries tolerate newer invocations, while unknown short flags stay hard errors
tags: cli
---

# CLI unknown long options warn instead of failing

`warnUnknownOption` in `packages/core/src/wirings/cli/command-parser.ts` pushes
onto `ParsedCommand.warnings`, not `ParsedCommand.errors`, so an unrecognised
`--long` option does not abort the command. The value is still parsed into
`optionArgs`, but `pluckCLIData` in `cli-runner.ts` drops anything absent from
the function's input schema — so the option is silently ignored at execution
time. The warning exists precisely so that dropping is not silent.

The reason is forward compatibility: a script or wrapper written against a newer
command version may pass options an older installed binary does not know, and
failing hard there turns a harmless extra flag into a broken pipeline.
`RESERVED_OPTIONS` exempts flags the runner handles itself (`help`) from the
warning. Unknown _short_ flags are treated differently — they go to
`result.errors` and do fail — because a bundled short-flag cluster like `-abc`
cannot be reliably attributed, and a typo'd short flag is far more likely than a
version skew.

**What this rules out:** promoting unknown long options to errors "for
strictness", and removing the warning on the grounds that the schema pluck
already handles it — that restores the silent drop this was added to end. It also
rules out making unknown short flags non-fatal for symmetry.
