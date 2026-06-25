---
'@pikku/addon-console': patch
'@pikku/cli': patch
---

fix(console): make the Tests tab show scenarios after a run

The Tests tab renders scenarios from `meta.functions[].tests.scenarios`, which
`readAllMeta()` builds by reading the function-tests harness's coverage JSON and
Cucumber HTML report. Three drifts left every function with `tests: undefined`:

- **`loadFunctionTests` looked in the wrong place.** It probed
  `function-tests/coverage/function-coverage.json` and
  `function-tests/tests/reports/cucumber-report.html`, but the harness (and
  `pikku tests coverage`) actually write `tests/.coverage/function-coverage.json`
  and `tests/tests/reports/cucumber-report.html`. It now anchors on
  `resolveFunctionsDir(metaService.basePath)` — the same single source of truth
  the run handlers and coverage writer use — and keeps the old relative paths as
  a fallback.
- **The console "Run tests" stream never wrote the HTML report.** It ran
  Cucumber with `--format message` only (for the live view), so scenarios
  vanished once the run finished. It now also emits
  `html:tests/tests/reports/cucumber-report.html`.
- **`pikku tests coverage` had the same gap** — no `--format`, so no report.
  It now writes the HTML report alongside the default progress output.
