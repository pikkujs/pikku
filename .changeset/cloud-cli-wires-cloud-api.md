---
'@pikku/cli': patch
'@pikku/addon-console': patch
---

The CLI wires `@pikkustudio/addon-cloud-api` as `cloudApi` and maps it to the `pikku cloud` addon, so `pikku all` syncs the cloud API contract and pins it in `pikku-addons.lock`. `@pikku/addon-console` calls the cloud API as `cloud:<name>`.
