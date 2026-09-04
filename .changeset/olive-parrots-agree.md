---
'@pikku/cli': patch
---

Report one `services-static-stubbed-import` finding per import, not one per service that stubs it.

`SERVICE_MODULE_MAP` deliberately shares a single pattern array between `agentRunner` and `ai`, so a validate run reported the same import twice with only the service name differing. The remedy is identical either way, so the first matching service names the finding.
