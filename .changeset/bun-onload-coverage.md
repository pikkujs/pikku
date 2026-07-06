---
'@pikku/cli': patch
---

Fix `pikku dev --coverage` on Bun: the istanbul loader returned `undefined` from
`onLoad` for non-instrumented files, which Bun (≥1.3.14) rejects with
"onLoad() expects an object returned" — crashing the dev server at boot as soon
as a `.gen`/`.test`/`.d` (or node_modules) `.ts` file loaded. Non-instrumented
files now pass through as an object.
