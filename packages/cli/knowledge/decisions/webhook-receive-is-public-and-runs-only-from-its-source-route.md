---
type: decision
title: A trigger webhook receive is public and runs only from its source's route, never as an RPC
description: pikkuWebhookReceive forces auth false, and its func receives services with secrets omitted, so a receive can run only through its source's route
tags: cli, triggers, webhooks, auth
---

# A trigger webhook receive is public and runs only from its source's route, never as an RPC

The `pikkuWebhookReceive` builder in `packages/cli/src/functions/wirings/triggers/serialize-trigger-types.ts` is
generated text. Its doc comment says a receive is public (`auth: false`) and only its source's route runs it, so it is
never callable as an RPC. Signatures are checked by the source's `verify` (`serialize-trigger-types.ts:173-176`).

The builder returns the config with `auth: false` forced on (`serialize-trigger-types.ts:189`). Its `func` takes
services typed as `Omit<SingletonServices, 'secrets'>` (`serialize-trigger-types.ts:188`), so a receive has no secret
accessor.

**What this rules out:** calling a webhook receive as an RPC, and giving a receive secret access through its services.
