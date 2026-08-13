---
'@pikku/cli': patch
---

Register the scenario instrumentation RPCs on `pikku serve` as well as `pikku dev`, so a scenario run can grade and collect coverage against either local server instead of failing with "RPC function not found: pikkuScenarioGradeRun".
