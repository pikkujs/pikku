---
'@pikku/cli': patch
'@pikku/addon-cloud-cli': patch
'@pikku/addon-console': patch
---

`pikku cloud` moves out of the CLI into `@pikku/addon-cloud-cli`, which the CLI wires with `wireAddon` and `refCLI('cloud:cloudCommands')`, so `pikku cloud …` resolves exactly as before for anyone who installs `@pikku/cli`. `@pikku/cli/cloud` is gone: the typed Pikku Studio Cloud client is `@pikku/addon-cloud-cli/client`, which `@pikku/addon-console` now imports. The cloud addon registers its changes backend through `@pikku/addon-changes-cli/backend`, and `pikku validate` asks it for the checks that need a Pikku Studio Cloud project over RPC.
