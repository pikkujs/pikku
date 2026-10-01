---
'@pikku/cli': patch
---

`createScenarioRunner`, `flattenAnalyticsEvent` and the generated feature-flag values are no longer exported from the `#pikku` leaves; the flag values are imported from `pikku-flags-manifest.gen.js` and renamed `declaredFeatureFlags`, `featureFlagsMeta` and `featureFlagsFallback`.
