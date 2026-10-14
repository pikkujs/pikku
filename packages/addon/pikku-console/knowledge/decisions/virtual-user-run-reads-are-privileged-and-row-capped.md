---
type: decision
title: Virtual-user run records and transcripts are a privileged read with a row ceiling in the function
description: Run records and turn transcripts sit under their own read scope rather than the wirings scope, and the page size is clamped in the function because the input type is not checked at runtime
tags: console, virtual-users, security
---

# Virtual-user run records and transcripts are a privileged read with a row ceiling in the function

`getVirtualUserRuns` (`packages/addon/pikku-console/src/functions/get-virtual-user-runs.function.ts`)
carries a security comment. An `adversarial` run's findings "are working exploits
carrying live ids", so this is "a privileged read, which is why it has a scope of
its own rather than riding on the wirings one" (`get-virtual-user-runs.function.ts:11-13`).
The scope is `pikku:console:virtualUsers:read` (`get-virtual-user-runs.function.ts:25`).

The page size is capped at `MAX_RUNS = 100` (`get-virtual-user-runs.function.ts:15`),
and the limit is clamped with `Math.min` before it reaches the store
(`get-virtual-user-runs.function.ts:35`). The comment says the scaffolded read
bounds this through zod, while "nothing types a console function's input at
runtime", so the ceiling is applied here (`get-virtual-user-runs.function.ts:32-34`).

`getVirtualUserRunSteps` (`packages/addon/pikku-console/src/functions/get-virtual-user-run-steps.function.ts`)
returns one run's turns. Its comment says "the transcript is strictly more sensitive
than the summary it belongs to", because it carries "the live ids and payloads the
run actually sent" (`get-virtual-user-run-steps.function.ts:10-12`). It is gated by
the same read scope (`get-virtual-user-run-steps.function.ts:23`). The limit is
clamped to `MAX_STEPS = 500` (`get-virtual-user-run-steps.function.ts:13`, `:32`).

**What this rules out:** exposing run records or transcripts under the wirings
read scope, and letting a caller request an unbounded page from the store.
