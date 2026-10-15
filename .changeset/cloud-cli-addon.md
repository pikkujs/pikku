---
'@pikku/cli': patch
'@pikku/addon-cloud-cli': patch
'@pikku/addon-changes-cli': patch
'@pikku/addon-console': patch
'@pikku/skills': patch
---

The `pikku cloud` and `pikku changes` commands leave `@pikku/cli` and become two addons: `@pikku/addon-cloud-cli` (`packages/addon/pikku-cloud-cli`) and `@pikku/addon-changes-cli` (`packages/addon/pikku-changes-cli`). The CLI depends on both and wires them with `wireAddon` and `refCLI('cloud:cloudCommands')` / `refCLI('changes:changesCommands')`, so `pikku cloud …` and `pikku changes …` resolve exactly as before for anyone who installs `@pikku/cli`.

`@pikku/cli/cloud` is gone: the typed Pikku Studio Cloud client is `@pikku/addon-cloud-cli/client`. Generic helpers an addon needs (output formatting, git helpers, `PreconditionError`) are exported from `@pikku/cli/addon-support`, and the validate building blocks from `@pikku/cli/addon-support/validate`. The changes backend registry (`registerChangesBackend`, `ChangesRPC`, `ChangeEvents`, `httpStatus`, `LOCAL_PROJECT_ID`) is exported from `@pikku/addon-changes-cli/backend`, which the cloud addon uses to keep a linked project's changes in Pikku Studio Cloud.

`pikku cloud validate` is merged into `pikku validate`, which gains `--skip-typecheck`, `--skip-deploy-checks` and `--migrations-base`; the addon contributes only the checks that need a Pikku Studio Cloud project. `pikku knowledge gaps` stays in the CLI and asks the changes addon which notes are already filed as a change.
