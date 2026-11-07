---
'@pikku/cli': patch
---

`pikku deploy plan` stages each engine's SQL migrations under `<providerDir>/db/<engine>`, for every provider, replacing what an earlier build staged there. Dev seeds are not shipped.
