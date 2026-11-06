---
'@pikku/cli': patch
'@pikku/addon-console': patch
---

The CLI wires `@pikkustudio/addon-cloud-api` as `cloudApi` and maps it to the `pikku cloud` addon, so `pikku all` syncs the cloud API contract and pins it in `pikku-addons.lock`. `@pikku/addon-console` calls the cloud API as `cloud:<name>` and drops the wish deck: the `listStudioWishes` and `reactToStudioWish` functions, the `pikku:console:wishes` scopes, and the wish and model access parts of the studio host are removed (breaking, documented here per the patch-only rule).
