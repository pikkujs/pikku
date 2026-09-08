---
'@pikku/cli': patch
'@pikku/inspector': patch
---

An addon publishes one registration file per function, so a consumer bundles
only the functions it deploys.

`pikku all --addon` now writes `function/single/<name>.gen.ts` alongside the
combined `function/pikku-functions.gen.ts`, plus `pikku-bootstrap-shared.gen.ts`
— the addon bootstrap without the combined registration. A consumer's bootstrap
pairs the shared file with the per-function files its filter actually reaches,
and the deploy analyzer gives each exposed addon function its own unit rather
than one unit per addon. An addon built by an older CLI publishes neither file,
so the consumer falls back to importing the whole bootstrap.
