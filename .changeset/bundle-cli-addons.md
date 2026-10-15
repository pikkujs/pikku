---
'@pikku/cli': patch
'@pikku/addon-console': patch
---

`@pikku/cli` now ships the `changes` and `cloud` command groups inside its own package instead of depending on `@pikku/addon-changes-cli` and `@pikku/addon-cloud-cli`, which were never published, so the CLI installs from npm again. The typed Pikku Studio Cloud client is re-exported as `@pikku/cli/cloud-client`, and `@pikku/addon-console` imports it from there and declares `@pikku/cli` as a peer.
