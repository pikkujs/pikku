---
type: decision
title: CLI parse errors are routed by message prefix
description: The CLI runners decide between printing help and printing errors by string-matching the prefixes the parser writes, so those message strings are an interface
tags: cli
---

# CLI parse errors are routed by message prefix

`parseCLIArguments` in `packages/core/src/wirings/cli/command-parser.ts` returns
a flat `string[]` of errors. It has no error codes and no error types. The
consumers — `executeCLI` in `cli-runner.ts` and `handleRawCLI` in
`channel/cli-raw-channel-runner.ts` — decide whether the user made a routing
mistake (show the help text) or a value mistake (print the errors) by
`error.startsWith(...)` against three literals: `'Unknown command:'`,
`'Command not found:'` and `'Missing subcommand:'`.

This is why the parser pushes `Missing subcommand: <path>` for a group command
that has subcommands but no `pikkuFuncId` of its own, rather than simply
returning the command meta and letting the runner discover it is unrunnable. The
message _is_ the routing signal. Rewording any of those three strings, or
localising them, silently turns "show me the subcommands" into a raw error dump.

**What this rules out:** editing those error message prefixes without updating
every `startsWith` site, and adding a new "this is a routing problem" parse error
without registering its prefix in both runners. If this needs to grow, replace
the whole scheme with a discriminated error type in one change — do not add a
fourth magic prefix.
