---
'@pikku/addon-console': patch
---

Route `getOpenapis`/`getOpenapiDetail` through `AddonService` and the fabric registry's `/registry/openapis` endpoints (unifying with the package funcs on `FABRIC_API_URL`), instead of the divergent `REGISTRY_URL`/`/api/openapis` path.
