---
type: decision
title: The webhooks command never handles provider signing secrets
description: The webhooks check, setup and teardown commands pass only the URL, label prefix and previous state to the app, and print one JSON line per source
tags: cli, webhooks, secrets
---

# The webhooks command never handles provider signing secrets

The `runWebhooks` function in `packages/cli/src/functions/commands/webhooks.ts` runs one lifecycle step for each webhook
source. Its doc comment says a signing secret the provider issues is stored by the source's own `setup`, in the credential
store, so it never passes through the command (`webhooks.ts:14-19`).

The arguments are `url`, `labelPrefix` and an optional previous-state file (`webhooks.ts:8-12`). The app runner is called with
`action`, `baseUrl`, `labelPrefix` and `previous` (`webhooks.ts:40-45`). Each outcome is printed as one JSON line
(`webhooks.ts:47-49`). A failed source makes the command throw with the names of the failed sources (`webhooks.ts:50-56`).

**What this rules out:** reading or printing a signing secret in the lifecycle command.
