---
type: decision
title: pikku report is top level through its own addon contract
description: The cloud addon exports reportCommands beside cloudCommands, and the CLI spreads it into its top-level commands with refCLI, so the command stays in the addon with its consent and sending logic
tags: cli, report, addon
---

# pikku report is top level through its own addon contract

`contracts.ts` exports `reportCommands` as a second `defineCLICommands`, and
`packages/cli/src/cli.wiring.ts` spreads it into `commands` with
`...refCLI('cloudCli:reportCommands')`. The inspector already reads that spread at the top level, so
this needed no framework change. Its key in `CONFIG_FREE_COMMANDS` is `report`.

Moving the function into `@pikku/cli` would have had to pull the login, the SDK and the consent code
out of the addon. A new addon that owns only this command would still need the cloud login.

There is no `pikku cloud report` alias, because there were no users.

**What this rules out:** the CLI reaching into addon internals to reimplement filing, and any
separate top-level mechanism for addons.
