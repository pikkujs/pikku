---
type: decision
title: The studio session middleware is installed by the dev server only, not by serve
description: The dev command registers the studio session middleware after bootstrap, while the serve command only disables dev virtual user sign-in
tags: cli, studio, auth, dev-server
---

# The studio session middleware is installed by the dev server only, not by serve

The dev command in `packages/cli/src/functions/commands/dev.ts` calls `registerStudioSession()` after the
app bootstrap (`dev.ts:174`), right after scenario instrumentation (`dev.ts:166-173`). Unlike the studio
session, scenario instrumentation is registered by serve as well (`packages/cli/src/functions/commands/serve.ts:99-106`).

`registerStudioSession` reads its token from `PIKKU_STUDIO_TOKEN` by default
(`packages/cli/src/functions/wirings/studio/register-studio-session.ts:23`). Its own rules, including the
32-character minimum and the header check, are in
[a studio header token must be at least 32 characters](studio-header-token-must-be-at-least-32-characters.md).

The serve command does not call it. Its setup calls `disableDevVirtualUserSignIn`
(`packages/cli/src/functions/commands/serve.ts:60`). A search of `packages/cli/src` finds the only
`registerStudioSession` call in `dev.ts`.

**What this rules out:** a studio header that grants the `pikku:console` scope on a server started with
serve. Registering it there would need a new call, not a change to the token rules.
