---
'@pikku/addon-console': patch
---

The console's webhooks page no longer crashes on an app that wires no webhook service. Outgoing webhooks are opt-in (`pikku enable webhook`), but the console lists every page unconditionally, so `listWebhookDeliveries`/`getWebhookDelivery` now return empty and null respectively — the same way `listScenarioRuns` and `getVirtualUserRuns` already handle a store their host never wired.
