---
type: decision
title: The browser driver is checked before the first scenario starts
description: resolveScenarioBrowserProvider refuses to start when the driver is missing, has no appUrl, or lacks an app url for a persona's app, and hands the driver either the root secret or a resolver
tags: cli, scenarios, browser, personas
---

# The browser driver is checked before the first scenario starts

`resolveScenarioBrowserProvider` in `packages/cli/src/functions/commands/scenario-browser.ts`
runs before any scenario, so a failure costs no run. The comment says a missing
appUrl or an uninstalled driver found mid-run would cost a whole run to learn about
(`scenario-browser.ts:131-134`).

A missing driver package throws with install instructions, or with the
`--no-browser` escape hatch (`scenario-browser.ts:157-166`).

The driver resolves the app url itself when it can. The check still refuses when
the result is missing or marked `appUrlSource: 'default'`, because a run against a
placeholder is worse than a refusal (`scenario-browser.ts:170-175`).

An actor whose app has no url in `appUrls` is refused too, since it would otherwise
browse the fallback app (`scenario-browser.ts:177-192`).

The credential is one of two things. A root secret derives each persona's
credential for a local `pikku dev` target. A resolver is used when the run was
given credentials for only some personas (`scenario-browser.ts:26-30`,
`scenario-browser.ts:93-99`).

**What this rules out:** a run that starts against the wrong app, and a missing
driver discovered after the first scenario has already run.
