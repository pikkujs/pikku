---
'@pikku/cli': patch
'@pikku/addon-cloud-cli': patch
'@pikku/addon-console': patch
'@pikku/skills': patch
---

The `pikku cloud` commands leave `@pikku/cli` and become the `@pikku/addon-cloud-cli` addon (`packages/addon/pikku-cloud-cli`). The CLI depends on it and wires it with `wireAddon` and `refCLI('cloud:cloudCommands')`, so `pikku cloud …` resolves exactly as before for anyone who installs `@pikku/cli`.

`@pikku/cli/cloud` is gone: the typed Pikku Studio Cloud client is `@pikku/addon-cloud-cli/client`. Generic helpers an addon needs (output formatting, git helpers, `PreconditionError`, the changes backend registry) are exported from `@pikku/cli/addon-support`, and the validate building blocks from `@pikku/cli/addon-support/validate`.

`pikku cloud validate` is merged into `pikku validate`, which gains `--skip-typecheck`, `--skip-deploy-checks` and `--migrations-base`; the addon contributes only the checks that need a Pikku Studio Cloud project. `pikku changes` stays in the CLI and uses Pikku Studio Cloud only when the addon's backend claims the project.
