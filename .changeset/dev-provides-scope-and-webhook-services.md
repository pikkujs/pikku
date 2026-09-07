---
'@pikku/cli': patch
---

`pikku dev` and `pikku serve` now provide the scope and webhook services.

An app that declares `scopeService` gets a `KyselyScopeService`, inited and synced from its own scope and system-role definitions; one that declares `webhookService` gets a `KyselyWebhookService` so deliveries are persisted and readable. Both are gated on the same `requiredServices` set `pikku db generate` filters the runtime schemas by, so the host never constructs a service whose tables the migrations did not create. Apps can delete the hand-rolled wiring from their `services.ts`.
