---
'@pikku/cli': patch
'@pikku/skills': patch
'@pikku/core': patch
'@pikku/better-auth': patch
'@pikku/playwright': patch
'@pikku/addon-console': patch
'@pikku/inspector': patch
'@pikku/knowledge': patch
'@pikku/kysely': patch
'@pikku/code-edit': patch
'@pikku/deploy-cloudflare': patch
'create-pikku': patch
---

Fabric is gone from the open toolchain. The previous names are removed with no aliases.

The CLI group is `pikku cloud …` and the export is `@pikku/cli/cloud`. The project link is the `cloud` key of `pikku.config.json` (`cloud.projectId`), the CLI keeps its local state in `~/.pikkustudio` (run `pikku cloud login` again), and the project config file is `pikkustudio.config.json`.

Every environment variable drops the `FABRIC_` prefix for `PIKKUSTUDIO_` with the same suffix: `PIKKUSTUDIO_API_URL`, `PIKKUSTUDIO_PROJECT_ID`, `PIKKUSTUDIO_TOKEN`, `PIKKUSTUDIO_OPERATOR_TOKEN`, `PIKKUSTUDIO_AUTH_PUBLIC_KEY`, `PIKKUSTUDIO_STAGE_ID` and the rest. Rename them wherever you set them.

Wire ids: the operator sign-in route is `/sign-in/cloud`, the plugin and mode literal is `'cloud'`, the Better Auth plugin is `pikkuCloud`, its session field is `pikkustudioadmin`, and the signature header is `x-cloud-sig`. The cloud API calls are `getCloudLogs`, `getCloudLogsByStageKind`, `cloudCliProjects`, `cloudCliDeployments`, `providedByCloud` and `recordCloudAnalyticsEvents`. Addon packages are `@pikkustudio/*`, scaffolded files live under `scaffold/cloud` and `__cloud_*__`, and the API hosts are the `pikkustudio.app` and `pikkustudio.dev` domains.

`pikku skills install --fabric` is `--cloud`, the install group is `cloud`, and the skills are `pikku-cloud`, `pikku-cloud-debug`, `pikku-admin-to-cloud` and `pikku-blueprint-to-cloud`.

The stale analytics forwarder copies are removed from the online-shop example and the starter template.

The sealed-box salt stays `pikkufabric/sealed-box/v1`: it is a cryptographic constant that already-sealed secrets depend on.
