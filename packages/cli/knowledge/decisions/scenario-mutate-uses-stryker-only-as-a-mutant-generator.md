---
type: decision
title: scenario mutate uses Stryker only as a mutant generator
description: Stryker's instrumentation breaks pikku's inspector, so mutants are generated with a no-op test command and run through the real scenario command one at a time; --stateInput cannot work around it
tags: cli, scenario, mutation-testing, stryker
---

# scenario mutate uses Stryker only as a mutant generator

`pikku scenario mutate` asks StrykerJS for mutants (command runner `true`,
`inPlace: false`, survivors only) and runs each one itself: splice into the
source, `pikku all`, `tsc --noEmit`, `pikku scenario run --spawn --flows`.
Killed means the scenario ran and failed; survived means it ran and passed;
codegen, tsc, boot and timeout failures are inconclusive and count neither way.

## Why not run Stryker's own runner

Stryker's instrumentation wraps config objects and function bodies in
`stryMutAct(...) ? {} : {...}`. The inspector then cannot see the function, so
`pikku dev` serves `RPC function not found` with no mutant active.

## Why `--stateInput` does not rescue it

Inspecting once on clean source (`--stateOutput`) and running instrumented code
with `--stateInput` was tried against real instrumenter output. The flag only
reaches the parent process: `pikku dev` runs codegen in child processes
(`runCodegenChild`) that are not given `--stateInput`, so they re-inspect the
instrumented source and regenerate `.pikku` without the function. Forwarding the
flag through the codegen child and `spawnDevServer` is the untried route.

## Gotchas

- `inPlace: true` makes Stryker prepend `// @ts-nocheck` to every project file
  and restore them only on a clean exit; an interrupt leaves hundreds of files
  modified. The sandbox mode never touches the project.
- Stryker looks for its checker plugin beside itself, which fails in a nested
  install (bun, pnpm). The command resolves both packages from the project and
  passes them as `plugins`.
- The typescript checker refuses to start on a project that does not type-check;
  the command checks the baseline first and then runs without the checker and
  without the per-mutant `tsc` stage.

## The clean code is run first

`scenario mutate` runs `pikku all` and the named scenarios against the unmutated project before it touches a file, and refuses to continue unless they pass. A scenario that already fails (or never runs) would otherwise "kill" every mutant and report 100%. On SIGINT/SIGTERM it also kills the in-flight child processes and regenerates from the restored source, so `.pikku` is not left holding the last mutant.
