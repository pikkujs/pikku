---
'@pikku/console': patch
'create-pikku': patch
'@pikku/addon-console': patch
'@pikku/addon-graph': patch
'@pikku/deploy-azure': patch
'@pikku/deploy-cloudflare': patch
'@pikku/deploy-serverless': patch
'@pikku/deploy-standalone': patch
'@pikku/aws-services': patch
---

State every package's license in the package itself.

Eight publishable packages had no `license` field, `@pikku/aws-services` said `UNLICENSED` by accident, and no package carried a LICENSE file at all — the grant lived only in the repo root, which npm tarballs never include. Every publishable package now declares its license and ships the matching LICENSE file, and `yarn check:licenses` fails the release if the two ever disagree.

`@pikku/console` is now explicitly BUSL-1.1 and named in the root LICENSE's Licensed Work alongside `@pikku/cli` and `@pikku/inspector`; the Additional Use Grant still permits production use for any purpose, including in free and open source software. Everything else — runtimes, services, clients, deploy adapters and the agent skills — is MIT, as the root LICENSE already said.
