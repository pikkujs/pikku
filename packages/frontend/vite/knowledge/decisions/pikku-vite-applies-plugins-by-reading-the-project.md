---
type: decision
title: pikkuVite applies plugins by reading the project, not by options
description: pikkuVite() always applies testIds and adds the Better Auth cross-site session relay only when the generated auth file exists, resolving the env file from clientFiles.envFile
tags: vite, frontend, config
---

# pikkuVite applies plugins by reading the project, not by options

`pikkuVite()` finds `pikku.config.json` upward from the Vite root (`pikku-config.ts`) and returns
the plugins the project calls for: `testIds()` always, and `crossSiteSession({ envFile })` from
`@pikku/better-auth/vite` when `<scaffold>/auth/auth.gen.ts` exists. Better Auth is detected by
that file because the config has no auth flag and the file is exactly what `pikku all` writes for
a `pikkuBetterAuth` export. `envFile` comes from `clientFiles.envFile`, so the relay uses the same
`apiUrl()` as the app.

`testIds()` still turns on Pikku Studio's source anchors only when
`PIKKUSTUDIO_CHANGES_PANEL === 'true'`.

**What this rules out:** a vite.config that lists plugins the config already implies, and the
relay shipping in a project that has no auth.
