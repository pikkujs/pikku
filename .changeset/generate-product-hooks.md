---
'@pikku/cli': patch
---

`pikku all` generates `useAnalytics` and `useFlag` into each backend's SDK at `.pikku/sdk/<backend>/exposed/pikku-product.gen.ts`, bound to the app's own `defineAnalyticsEvents` and `defineFeatureFlags` types. Each hook is written only when the app declares events (with `scaffold.analytics`) or flags (with `scaffold.featureFlags`), and nothing is written otherwise, so an app no longer hand-writes a `product.ts` binding file. New `pikku product` command; the pikku-analytics and pikku-flags skills now point at the SDK import.
