---
'@pikku/cli': patch
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/addon-fabric-cli': patch
'@pikku/addon-console': patch
'@pikku/skills': patch
---

The Fabric commands leave the CLI and become the `@pikku/addon-fabric-cli` addon, wired into `pikku fabric` through `refCLI`. `pikku changes` stays in the CLI and uses Fabric only when the addon's backend claims the project. `pikku validate` takes over the generic checks of the old `pikku fabric validate` (with `--skip-typecheck`, `--skip-deploy-checks` and `--migrations-base`) and asks the addon for the checks that need a Fabric project. `refCLI` now carries groups, descriptions, parameters and renderers, and an addon exposes its renderers from `./renderers`.
