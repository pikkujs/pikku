---
type: decision
title: Fabric login makes the person type the code instead of linking it
description: pikku fabric login prints a one-time code and opens the console page without the code in the URL, so the person who runs the command is the one who approves it
tags: cli, fabric, auth, login
---

# Fabric login makes the person type the code instead of linking it

`FabricLogin` requests a code with `requestCliAuth`, then opens `${consoleUrl}/cli-auth`
(`packages/cli/src/fabric/functions/login.function.ts:105-111`). The URL carries
no `?code=` parameter. The comment says the typed code is what proves the person
approving the token is the person who ran the command, and that a link carrying
its own code would be a one-click grant for anyone who can show it to a signed-in
user (`login.function.ts:107-110`).

The CLI polls `pollCliAuth`. A `rejected` status stops at once with a cancel
message, and an `expired` status stops with an expiry message
(`login.function.ts:127-139`). When the status is `confirmed` the token is written
to the auth file for that API URL (`login.function.ts:140-146`).

Static tokens skip this flow. `--token` or `--api-key` is saved directly
(`login.function.ts:89-97`).

**What this rules out:** a login link that approves on click, and a CLI that
trusts the browser without a code the terminal has seen.
