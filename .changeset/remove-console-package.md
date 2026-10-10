---
'@pikku/cli': patch
---

The CLI no longer bundles the Pikku Console app: `console-app` is not produced by the build, so `pikku dev` and `pikku serve --console` serve no console UI unless one is placed there.
