---
type: decision
title: The browser driver is checked before the first scenario starts
description: resolveScenarioBrowserProvider refuses to start when the driver is missing, has no appUrl, or lacks an app url for a virtual user's app, and hands the driver a statement mint
tags: cli, scenarios, browser, virtual-users
---

# The browser driver is checked before the first scenario starts

`resolveScenarioBrowserProvider` in `packages/cli/src/functions/commands/scenario-browser.ts`
runs before any scenario, so a failure costs no run. The comment says a missing
appUrl or an uninstalled driver found mid-run would cost a whole run to learn about.

A missing driver package throws with install instructions, or with the
`--no-browser` escape hatch.

The driver resolves the app url itself when it can. The check still refuses when
the result is missing or marked `appUrlSource: 'default'`, because a run against a
placeholder is worse than a refusal.

A virtual user whose app has no url in `appUrls` is refused too, since it would
otherwise browse the fallback app.

The sign-in credential is a statement: the caller passes a `mint`
(`VirtualUserStatementMint`) that signs one statement per login for the stage's
sign-in endpoint, and it is handed to the driver alongside the virtual users.

**What this rules out:** a run that starts against the wrong app, and a missing
driver discovered after the first scenario has already run.
