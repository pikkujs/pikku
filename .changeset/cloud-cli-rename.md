---
'@pikku/cli': patch
'@pikku/skills': patch
'@pikku/core': patch
'@pikku/addon-console': patch
---

The `pikku fabric` command group is now `pikku cloud`, and the `@pikku/cli/fabric` export is `@pikku/cli/cloud`. The previous names are removed with no aliases.

The project link lives under the `cloud` key of `pikku.config.json` (`cloud.projectId`, was `fabric.projectId`), and the CLI keeps its local state in `~/.pikkustudio` (`auth.json`, `report-consent.json`, `findings`) instead of `~/.fabric`; run `pikku cloud login` again. The project config file is `pikkustudio.config.json`.

Every environment variable the CLI and core read drops the `FABRIC_` prefix for `PIKKUSTUDIO_`, with the same suffix: `PIKKUSTUDIO_API_URL`, `PIKKUSTUDIO_PROJECT_ID`, `PIKKUSTUDIO_TOKEN`, `PIKKUSTUDIO_OPERATOR_TOKEN`, `PIKKUSTUDIO_AUTH_PUBLIC_KEY`, `PIKKUSTUDIO_STAGE_ID` and the rest. Rename them wherever you set them.

`pikku skills install --fabric` is `--cloud`, the `fabric` install group is `cloud`, and the skills `pikku-fabric`, `pikku-fabric-debug`, `pikku-admin-to-fabric` and `pikku-blueprint-to-fabric` are `pikku-cloud`, `pikku-cloud-debug`, `pikku-admin-to-cloud` and `pikku-blueprint-to-cloud`.

Unchanged on purpose because they cross a deployed boundary: the `/sign-in/fabric` route, the `fabric` plugin id, the `getFabricLogs*` and `fabricCliProjects` RPC names, `@pikkufabric/*` package names and the `pikkufabric` domains.
