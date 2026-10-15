---
type: decision
title: Page screenshots run as a virtual user by reusing the scenario sign-in
description: pikku pages screenshot with --as mints a sign-in statement and resolves the scenario browser provider for the virtual user, instead of an anonymous browser
tags: cli, pages, virtual-users, scenarios
---

# Page screenshots run as a virtual user by reusing the scenario sign-in

`pagesScreenshot` in `packages/cli/src/functions/commands/pages.ts` takes an `as` option naming a
virtual user. When it is set, the command resolves the environment, then calls
`resolveScenarioBrowserProvider` with a statement mint from `resolveStatementMint` (for the
`page screenshots` purpose), the virtual users from `resolveVirtualUsers`, and
`browserScenarios: ['pages screenshot']`. The session it photographs is
`provider.sessionFor(as)`. Without `as`, it opens a plain page session.

The browser driver is checked first, and a missing driver throws with the install command.

**What this rules out:** a virtual user screenshot taken in an anonymous browser session. The
sign-in is the one the scenarios use.
