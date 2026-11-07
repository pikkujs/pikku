---
'@pikku/cli': patch
---

`pikku deploy plan` stages each engine's SQL migrations and dev seed under `<providerDir>/db/<engine>`, for every provider.
