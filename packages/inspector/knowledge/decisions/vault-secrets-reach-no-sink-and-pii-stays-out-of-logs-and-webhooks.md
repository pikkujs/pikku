---
type: decision
title: Vault secrets reach no sink, and PII is kept out of logs, the console and webhooks only
description: check-classified-sinks rejects revealed secrets in every listed sink and PII only in the logger, console and webhook sinks
tags: [inspector, pii, secrets, lint]
---

# Vault secrets reach no sink, and PII is kept out of logs, the console and webhooks only

The sink table in `packages/inspector/src/utils/check-classified-sinks.ts` (lines 44-59) lists
which methods count as sinks and what each one rejects:

- `Logger`, every method, rejects `secret` and `pii` (line 49);
- `WebhookService.send` rejects `secret` and `pii` (line 50);
- `QueueService.add` rejects `secret` only (line 51);
- `EmailService.send` rejects `secret` only (line 52);
- `AuditService` `audit` and `write` reject `secret` only (lines 53-57);
- `AuditLog.write` rejects `secret` only (line 58).

`console` is handled separately and rejects both (line 62).

The comment at lines 23-38 gives the reasons. A vault secret is wrong in every sink (lines 23-24).
PII is wrong only where it leaves the operator's control or lands somewhere never meant to hold
it. Lines 37-38 say a queue payload "stays on the operator's own infrastructure", and lines 33-34
say an email is addressed to the data subject.

Lines 40-42 say `private` is absent from the table on purpose.

**What this rules out:** a revealed secret reaching any listed sink, and PII reaching a logger,
the console or a webhook. PII is allowed into queues, email and audit by this table.
