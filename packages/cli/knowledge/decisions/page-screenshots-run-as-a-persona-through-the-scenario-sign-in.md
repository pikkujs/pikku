---
type: decision
title: Page screenshots run as a persona by reusing the scenario sign-in
description: pikku pages with a persona loads the wired persona sign-in and resolves persona credentials for the browser provider, instead of an anonymous browser
tags: cli, pages, personas, scenarios
---

# Page screenshots run as a persona by reusing the scenario sign-in

The pages command in `packages/cli/src/functions/commands/pages.ts` takes an `as` option for a persona.
When it is set, the command resolves the environment, then calls `loadWiredPersonaSignIn` with the
inspector state (`pages.ts:115-122`). It resolves the scenario browser provider with the persona
credentials for the `page screenshots` purpose and the resolved actors (`pages.ts:123-131`), and
passes `browserScenarios: ['pages screenshot']` (`pages.ts:133`).

The browser driver is checked first, and a missing driver throws with the install command
(`pages.ts:106-111`).

**What this rules out:** a persona screenshot taken in an anonymous browser session. The sign-in is
the one the scenarios use.
