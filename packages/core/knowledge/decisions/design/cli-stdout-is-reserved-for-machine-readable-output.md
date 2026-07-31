---
type: decision
title: CLI stdout is reserved for machine-readable output
description: The default renderer emits single-line NDJSON, diagnostics go to stderr, and --json only hijacks rendering for commands that declared a renderer
tags: cli
---

# CLI stdout is reserved for machine-readable output

`defaultJSONRenderer` in `packages/core/src/wirings/cli/cli-runner.ts` (and its
twin in `channel/cli-channel-runner.ts`) calls `JSON.stringify` without an
indent argument. That is not laziness: one result per line is NDJSON, which stays
parseable when a command streams multiple results through the CLI channel.
Pretty-printing spreads one record over many lines and breaks every line-oriented
consumer downstream.

Two rules follow from the same principle in `executeCLI`. Parse warnings —
non-fatal by design, see the unknown-options decision — are written with
`console.error`, so they never interleave into a command's machine-readable
stdout. And `--json` / `--output json` only substitutes `defaultJSONRenderer`
when the command declared its own `render`; a command with no renderer is one
that prints inline as it works, and forcing its return value through the JSON
renderer would append a stray record after output that was never structured to
begin with. The `commandRenderer !== undefined` guard in the render block is what
enforces that.

Error formatting follows too: `isExpectedError(error)` prints `error.message`
alone with no `Error:` prefix, because an expected `PikkuError` (a build gate
tripping, a validation failure) has a message written to be read as the whole
output. Anything else is logged as an object so its stack survives.

**What this rules out:** adding an indent argument to `defaultJSONRenderer`,
routing warnings or progress messages to stdout, and dropping the
`commandRenderer !== undefined` condition so `--json` applies uniformly.
