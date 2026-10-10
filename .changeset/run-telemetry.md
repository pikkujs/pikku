---
'@pikku/cli': patch
---

`pikku dev`, `pikku serve` and `pikku all` record CPU, memory, event-loop delay and every invocation to `.pikku/runs/<run>` as JSONL, keeping the last 20 runs, so a slow or heavy run can be inspected afterwards.
