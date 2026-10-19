---
'@pikku/inspector': patch
'@pikku/addon-console': patch
---

Scenario workflow meta now carries `scenario: true` alongside `source: 'scenario'`, so Studio and the console can tell a scenario from a real workflow. The console's workflow count no longer includes scenarios.
