---
'@pikku/console': patch
---

Extract `getServerUrl`/`setServerUrl` into a standalone, unit-tested `serverUrl` module (now defaults to the current origin instead of hardcoded localhost) and move test-stream error handling into a tested `testsStreamError` helper. Adds a clearer empty state + `pikku tests init` hint when no function-test harness is found, and proxies `/function-tests` and `/workflow-run` in the console dev server.
