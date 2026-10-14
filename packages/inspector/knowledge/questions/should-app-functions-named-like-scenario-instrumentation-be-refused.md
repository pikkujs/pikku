---
type: question
title: Should an app function named like scenario instrumentation be silently skipped?
description: Five instrumentation names are skipped by name in every project, so an app's own function with one of those names disappears without a log
tags: [inspector, scenarios, functions]
---

# Should an app function named like scenario instrumentation be silently skipped?

`SCENARIO_INSTRUMENTATION_FUNCTIONS` in
`packages/inspector/src/add/scenario-instrumentation.ts` lists five names (lines
22-28). `isScenarioInstrumentationFunction` matches them on the id before any `@`
(lines 40-42).

In `packages/inspector/src/add/add-functions.ts`, a function whose id or name matches
is returned before it is registered (lines 571-576). No logger call happens there.
The file's comment says the function is "not application code" and must not be
registered.

The file comment gives the reason for matching by name: it keeps an existing
project's checked-in `scenarios.gen.ts` from deploying (lines 12-15). Lines 17-20
say `pikkuScenarioGradeRun` is reserved "so an application cannot claim it". No
comment says the same about the other four names.

Question: should an application's own function named `pikkuScenarioResetStubs`,
`pikkuScenarioGetStubCalls`, `pikkuScenarioTakeLiveCoverage` or
`pikkuScenarioResetLiveCoverage` be refused with a critical, as the reserved name
would be, rather than dropped silently?
