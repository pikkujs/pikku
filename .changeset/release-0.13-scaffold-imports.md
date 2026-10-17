---
'@pikku/cli': patch
'@pikku/skills': patch
---

The test project `pikku new addon` scaffolds imports its application types from `@pikku/core/types`, like the addon itself, instead of the package root, which no longer exports them. Four skill references (`pikku-middleware`, `pikku-services`, `pikku-wiring` channels, `pikku-deploy` ws) import `addGlobalMiddleware`, `pikkuServerLifecycle`, `pikkuChannelMiddleware` and `stopSingletonServices` from the subpaths that export them. The CLI tarball no longer ships `dist/bin/pikku-bin.mjs`, the entry the native binaries are compiled from, nor the bootstrap leaf index `dist/.pikku/node/index.js` whose source the build regenerates away.
