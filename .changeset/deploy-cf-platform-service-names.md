---
'@pikku/deploy-cloudflare': patch
---

Expose `serviceNames` (each unit-service's `sourceServiceName`) on `PlatformImports`, so a `PlatformServiceContributor` can gate its imports/emit on a custom platform-specific service being required by the unit — without the OSS adapter needing to know that service by name.
