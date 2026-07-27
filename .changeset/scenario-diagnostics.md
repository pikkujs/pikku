---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/playwright': patch
---

Scenarios get a fresh browser each time, a failure report worth reading, and a formatter that owns the output.

Three changes that only make sense together.

**A scenario no longer inherits the last one's browser.** `ScenarioBrowserProvider` gains an optional `reset()`, called between scenarios: every actor's context — cookies, storage, open pages, in-page listeners — is discarded, while the browser itself stays up. Before this, one browser context per actor lived for the whole run, so scenario 2 started signed in as whoever scenario 1 left behind. The boundary is the context rather than the browser because that is where the isolation actually lives, and re-opening one costs milliseconds instead of a relaunch. `reset()` runs *before* each scenario, so the last one's window is still there to look at when a headed run stops.

**A failure says what happened.** The runner reported `run.error.message` and nothing else — which for a browser step is "Timed out waiting for selector" with every useful detail removed. `ScenarioBrowserProvider` gains an optional `captureFailure(label)`, and the driver's page diagnostics (console errors, uncaught exceptions, failed requests, 4xx/5xx API responses) — collected all along and until now thrown away — are reported under the failing step, with a screenshot written to `<outDir>/scenario-failures`:

```
  ✗ failed at: Then  the admin sees the edit button
    Timed out waiting for selector button[title="Edit function"]
    browser (admin): http://localhost:4077/console/functions
      console:    TypeError: x is not a function
      api:        500 /api/rpc/console:readFunctionSource
      screenshot: .pikku/scenario-failures/code-editor-admin.png
    at readsFunctionSource (…/code-editor.steps.ts:71:5)
```

Stacks are trimmed to the project's own frames, because the framework's are never the bug; `--trace` keeps all of them. An expected failure (a `PikkuError`) prints its message alone — a stack adds nothing to a deliberate one.

**A failed scenario now shows its ladder at all.** It did not before, for a reason that took a live run to find: an inline run that fails throws out of `startWorkflow` instead of returning `{ runId }`, so the runner never learned the id of the one run whose steps were worth reading — and fell back to the run error alone. `startWorkflow` gains an `onRunCreated` option, called the moment the run exists, which is the only point guaranteed to happen whether the run goes on to pass, fail or suspend. A failure now prints every step that ran, marks the one that didn't, and names it in `✗ failed at:`.

A browser timeout's `message` carries its entire call log, so the summary line and the ladder row take its first line only — the block underneath still prints all of it. Three copies of the same paragraph, one of them wrapping mid-table, is not a report.

**All of that output now goes through one formatter.** `formatScenarioReport(report)` takes a plain serialisable report — no Maps, no meta handles — and returns the lines to print, the way `deploy plan` already works. Joining a run to the prose that declared it stays in `scenario-ladder.ts`, where the inspector state is; laying it out is the formatter's job. A second reporter (JSON, JUnit) is now a function rather than an excavation.

**Browser drivers are pluggable.** `scenarios.browserDriver` in `pikku.config.json` names the package that drives `browser: true` steps; it defaults to `@pikku/playwright` but nothing requires it. A driver is any package exporting `createScenarioBrowserProvider(options)` — or a provider class — returning an object with `sessionFor()` and `close()`. `reset()` and `captureFailure()` are optional, so a driver written against the earlier interface keeps working: it simply offers no isolation and no diagnostics. A package that is neither says so, instead of failing later in a way nobody can read.
