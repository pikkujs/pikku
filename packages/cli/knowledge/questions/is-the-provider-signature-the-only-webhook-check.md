---
type: question
title: Is the provider signature the only check on a generated webhook route?
description: The generated webhook source route is auth false, and the core receiver adds an enabled-source check and a signature check that depends on whether the source declares verify
tags: cli, webhooks, auth, triggers
---

# Is the provider signature the only check on a generated webhook route?

The generated route in `packages/cli/src/functions/wirings/webhook-sources/serialize-webhook-sources.ts` is `auth: false`
(`serialize-webhook-sources.ts:42`). Its handler calls `receiveWebhookSourceRequest` with the source name and wire
(`serialize-webhook-sources.ts:44-48`).

The core receiver in `packages/core/src/wirings/trigger/webhook-source-runner.ts` does more than check a signature:

- A source with a trigger source store that is not enabled answers 404 (`webhook-source-runner.ts:238-241`).
- A HEAD request is answered 200 without events (`webhook-source-runner.ts:247-250`).
- `verifyRequest` runs before the source's `receive` (`webhook-source-runner.ts:251`, `webhook-source-runner.ts:253-261`).
- `verifyRequest` returns true when the source has no `verify`, so the source's own `receive` is the only check
  (`webhook-source-runner.ts:178`).
- A request with a body and a bad signature throws before `receive` (`webhook-source-runner.ts:194-199`).
- A request without a body and without a valid signature still runs `receive`, and events from it are refused only
  when the list is not empty (`webhook-source-runner.ts:273-277`).

So the provider signature is one check, and it is not the only one. Whether it is enough depends on whether each source
declares `verify`. That is not answered by the generated route. The code is kept as written.
