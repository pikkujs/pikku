---
'@pikku/skills': patch
---

Document `pikkuServerLifecycle` in the skills corpus. `pikku-concepts` now presents both bootstrap paths (letting `pikku dev`/`pikku serve` own the server vs. embedding in your own runtime) instead of only the hand-rolled entrypoint, `pikku-services` gains a `pikkuServerLifecycle` reference covering hook ordering, discovery rules and the `afterStop`-runs-after-services-stop caveat, and `pikku-config` documents the `lint` severity map including `customServerBootstrap`.
