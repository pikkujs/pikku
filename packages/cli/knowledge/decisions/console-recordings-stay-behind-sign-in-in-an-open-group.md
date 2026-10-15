---
type: decision
title: Console recordings stay behind sign-in even though the console route group is auth false
description: The generated console route group is auth false, but the metadata stream and scenario artifact routes set auth true, because recordings are of an application being used
tags: cli, console, auth, routes
---

# Console recordings stay behind sign-in even though the console route group is auth false

`consoleRoutes` in `packages/cli/src/functions/wirings/console/serialize-console-functions.ts` sets
`auth: false` on the group (`serialize-console-functions.ts:72-73`). Its routes are then overridden
individually.

The comment on `metaChangesStream` says everything else in the group is metadata, but these are
recordings of an application being used, so they are authenticated even though the group is not
(`serialize-console-functions.ts:82-85`). `metaChangesStream` sets `auth: true`
(`serialize-console-functions.ts:90`), and `scenarioArtifact` sets `auth: true`
(`serialize-console-functions.ts:96`).

**What this rules out:** removing the per-route `auth: true` on recording routes when the group
default changes. Each route carries its own setting.
