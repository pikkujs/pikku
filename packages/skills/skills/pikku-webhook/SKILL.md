---
name: pikku-webhook
description: >-
  Use when an application needs to SEND outgoing webhooks — notifying a customer's endpoint that
  something happened, with signing, retries and a delivery log. Covers WebhookService,
  QueueWebhookService, the `pikku-outgoing-webhooks` queue worker, `scaffold.webhook`,
  `config.webhook`, signature verification on the receiving side, and KyselyWebhookService's
  delivery history. TRIGGER when: code uses webhookService, QueueWebhookService,
  KyselyWebhookService, pikkuWebhookWorkerFunc, PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME,
  SendWebhookInput or X-Pikku-Signature. TRIGGER when: the user asks to emit events to a
  customer URL, build a webhook endpoint settings screen, add a signing secret, or show
  delivery attempts. DO NOT TRIGGER when: the user is RECEIVING webhooks from a third party
  into a route — that is an ordinary wireHTTP function (use pikku-wiring).
installGroups: [core]
---

# Pikku Outgoing Webhooks

Pikku ships an outgoing webhook primitive, so an application never hand-rolls
`fetch` + HMAC + retries. `WebhookService.send()` signs the body, enqueues a
delivery job, and the generated `pikku-outgoing-webhooks` queue worker POSTs it;
a non-2xx throws, so the queue retries with backoff. Swapping the queue-only
default for `KyselyWebhookService` adds a durable delivery + attempt history
with no change to call sites.

**Do not write a bespoke `fetch(url, { headers: { 'x-my-signature': … } })` for
an outgoing event.** If the shipped signing scheme or delivery model genuinely
does not fit, subclass `WebhookService` — it is an abstract class precisely so
an app can substitute its own transport (direct send, Svix) and keep the same
call sites and delivery history.

## Agent Operating Procedure

1. Turn the feature on: `"scaffold": { "webhook": true }` in `pikku.config.json`.
2. Run `pikku all`. It writes `<scaffold.pikkuDir>/webhook/webhook.gen.ts` (the
   queue worker) and `webhook.schemas.gen.ts`. Never hand-edit either.
3. Register a `webhookService` singleton in `createSingletonServices`. Without
   it `services.webhookService` is `undefined` and nothing sends.
4. Make sure a queue backend is wired. The worker is an ordinary
   `wireQueueWorker` — with no `queueService`, `send()` throws.
5. Call `webhookService.send(...)` from a function body. Never call `fetch`
   directly for an outgoing event.
6. Validate with `pikku all` and the project's typecheck.

## Config

```jsonc
// pikku.config.json
{
  "scaffold": {
    "pikkuDir": "src/pikku",
    "webhook": true, // on or off — it exposes no endpoint and has no path override
  },
}
```

`scaffold.webhook` is a plain boolean, unlike the other scaffold flags which
accept `{ path }`. The two generated paths are derived
(`webhookWorkersFile`, `webhookSchemasFile`) and can be set explicitly in
`pikku.config.json` if a project needs them somewhere else.

Runtime defaults live on `CoreConfig.webhook`:

```ts
export interface Config extends CoreConfig {}

const config: Config = {
  webhook: {
    secret: 'WEBHOOK_SIGNING_KEY', // a secret NAME, resolved via services.secrets
    signatureHeader: 'X-Pikku-Signature', // default
    retries: 3, // default; attempts = retries + 1
    retryDelay: '30s', // omit for exponential backoff
    allowedHosts: ['hooks.example.com'], // SSRF allowlist
  },
}
```

`allowedHosts` set means _only_ those hostnames are deliverable. Omitted, every
public host is allowed and private/internal ranges are blocked — loopback,
RFC1918, link-local `169.254.0.0/16` (cloud metadata), CGNAT `100.64.0.0/10`
(Alibaba's metadata endpoint), multicast and the TEST-NETs. A URL is
user-supplied data; do not bypass `safeFetch` by delivering yourself.

## Sending

```ts
import { pikkuFunc } from '#pikku/function'

export const notifyOrderShipped = pikkuFunc({
  func: async ({ webhookService }, { endpointUrl, orderId, secret }) => {
    const { jobId } = await webhookService.send({
      url: endpointUrl,
      event: 'order.shipped',
      data: { orderId, shippedAt: new Date().toISOString() },
      secret, // per-endpoint raw key; overrides config.webhook.secret
      organizationId: orgId, // persisted by store-backed services only
    })
    return { jobId }
  },
})
```

`send()` returns as soon as the job is enqueued — it is **not** a delivery
receipt. `jobId` is the queue job; with `KyselyWebhookService` it is also the
`deliveryId`, so it is stable across retries and is what a UI polls.

The two `secret` fields are deliberately different and are the most common
mistake:

| Where                     | Meaning                                                             |
| ------------------------- | ------------------------------------------------------------------- |
| `config.webhook.secret`   | a secret **name**, read through `services.secrets` at enqueue time  |
| `SendWebhookInput.secret` | a **raw HMAC key**, for per-endpoint secrets held in your own table |

The raw key never enters the queue payload: the body is signed at enqueue time
and only the resulting header travels with the job. That is also why the body
is serialized once — a retry re-POSTs identical bytes, so the signature stays
valid.

With neither secret set, deliveries go **unsigned**. A missing named secret is
logged as an error and still sends unsigned; treat that log line as a
misconfiguration, not noise.

## What this does not give you

There is no subscription model. `webhookSchema` owns exactly two tables —
`webhookDelivery` and `webhookDeliveryAttempt` — and both are delivery-side
history. Nothing stores _which_ URL belongs to which customer, which events
they asked for, or whether their endpoint is still enabled.

That is the app's table, and every app that exposes webhooks to its users
needs one:

| Column    | Why                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| `url`     | where to POST                                                                                                 |
| `secret`  | the raw HMAC key, passed as `SendWebhookInput.secret`                                                         |
| `events`  | which event names this endpoint subscribed to                                                                 |
| `enabled` | so a failing endpoint can be paused without deleting it                                                       |
| scope     | the org/tenant column you filter on — mirror it into `organizationId` so the delivery log scopes the same way |

So one emitted event becomes a `SELECT` over your endpoint table and one
`send()` per row. Everything after that call — signing, queueing, retrying,
recording — is the primitive's.

The single-integration case needs none of this: one fixed URL on the row it
belongs to, and `send()` straight at it.

## Verifying on the receiving side

`sign()` produces `sha256=<hex>` (GitHub style, body only, no timestamp) into
`X-Pikku-Signature`, and `X-Pikku-Event` carries the event name. `verify()` is
public because receivers share the scheme:

```ts
const raw = await request.text()
if (
  !webhookService.verify(secret, request.headers.get('x-pikku-signature')!, raw)
) {
  throw new UnauthorizedError()
}
```

It compares in constant time via `timingSafeStringEqual`. Never compare
signatures with `===`, and verify against the **raw body text**, not a
re-serialized parsed object.

## Delivery history

The default `QueueWebhookService` keeps no history: `listDeliveries`,
`getDelivery` and `recordAttempt` throw `NotImplementedError`. Register
`KyselyWebhookService` from `@pikku/kysely` to get them.

```ts
import { KyselyWebhookService } from '@pikku/kysely'

const webhookService = new KyselyWebhookService(queueService, kysely)
await webhookService.init() // creates webhookDelivery + webhookDeliveryAttempt
```

`init()` is idempotent and creates the tables through the pikku schema
bootstrap. Do not write your own migration for these tables.

- `webhookDelivery` — one row per `send()`: `deliveryId`, `organizationId`,
  `url`, `event`, `status` (`pending` | `delivered` | `failed`), `attempts`,
  `createdAt`, `updatedAt`, `deliveredAt`.
- `webhookDeliveryAttempt` — one row per try: `attemptNumber`, `statusCode`,
  `responseBody` (failures only, truncated to 2000 chars), `error`.

Read them through the service, not with your own query:

```ts
const deliveries = await webhookService.listDeliveries({
  organizationId,
  limit: 25,
})
const detail = await webhookService.getDelivery(deliveryId) // { delivery, attempts }
```

Building a console screen is `listDeliveries` for the list and `getDelivery` for
the drill-in. A hand-written select over `webhookDelivery` is a sign the wrong
service is registered.

## What the worker does

The generated worker is a thin wrapper over `pikkuWebhookWorkerFunc`. It POSTs
through `safeFetch` with a 30s timeout, treats 2xx as delivered, captures the
response body on failure, records the attempt when a `deliveryId` is present,
and **throws** on failure so the queue retries. Attempt recording is
best-effort: a store error is logged and does not fail the delivery. Retry
exhaustion is logged by the queue runner — there is no `onFailure` hook.

## Gotchas

- `webhookService` is optional on `CoreSingletonServices`, but do **not** guard
  it in a function body — destructuring it marks it required (see
  `pikku-services`). Register it in `services.ts` or fail fast at startup.
- The queue name is `pikku-outgoing-webhooks`, not `pikku-webhooks`.
- `retries: 0` means one attempt and no backoff, not "retry forever".
- The gateway's inbound `webhook` transport type is a different feature. This
  skill is outbound only.
- Signing is body-only with no timestamp, so it does not defend against replay
  on its own. If a receiver needs replay protection, put a nonce or timestamp
  **inside** the payload, where it is covered by the signature.
