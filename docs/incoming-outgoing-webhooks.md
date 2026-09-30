# Incoming and outgoing webhooks

Two features with nothing in common but the word:

|               | Outgoing                                                       | Incoming                                                     |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| Declared with | `defineOutgoingWebhook`                                        | `wireTriggerWebhookSource`                                   |
| Direction     | this app → a subscriber                                        | a provider → this app                                        |
| Declares      | `event`, `title`, `description?`, `payload`                    | `name`, `events`, `receive`, `check?`, `setup?`, `teardown?` |
| Who registers | the subscriber, at runtime                                     | this app, at deploy time, through `setup`                    |
| Delivery      | `QueueWebhookService` → `pikku-outgoing-webhooks` queue        | `IncomingWebhookService` → `pikku-incoming-webhooks` queue   |
| History       | `webhookDelivery` + `webhookDeliveryAttempt` (`@pikku/kysely`) | `webhookReceipt` + `webhookReceiptAttempt` (`@pikku/kysely`) |

`defineWebhook` only ever existed on `feat/console-ux` and was never released,
so the rename to `defineOutgoingWebhook` breaks nobody.

## Scoping

Outgoing events are scoped the same way everything else an addon owns is: by the
`wireAddon` instance name.

- An app's own declarations have no prefix.
- An addon's declarations are prefixed with the instance name. Two instances of
  one package are two independent sets: separate URLs, separate provider
  registrations, separate signing secrets — possibly two provider accounts.
- An addon sees only its local names. The parent sees everything by its full
  name. That matches `workflowService`, which is already wrapped per instance to
  prefix workflow names (`addon-runner.ts`).

## Outgoing

```ts
export const orderPaid = defineOutgoingWebhook({
  event: 'order.paid',
  title: 'Order paid',
  payload: z.object({ orderId: z.string(), amount: z.number() }),
})
```

Typed at both levels from generated maps:

- **Inside an addon**, the addon's codegen produces its `OutgoingWebhooksMap`
  with local names; `webhookService.send({ event: 'order.paid', data })` is
  checked against it. The runtime wraps the addon's `webhookService` so the
  event leaves as `<instance>:order.paid`.
- **In the app**, `pikku-outgoing-webhooks.gen.ts` imports each installed
  addon's map and prefixes it per wired instance:

  ```ts
  type Prefixed<P extends string, M> = {
    [K in keyof M as `${P}:${K & string}`]: M[K]
  }
  export interface OutgoingWebhooksMap
    extends
      AppOutgoingWebhooks,
      Prefixed<'stripe-eu', StripeOutgoingWebhooksMap> {}
  ```

  The app's `send` is typed against the full map, so it can send an addon's
  event by its full name. The app is the trust root — it already calls the
  addon's functions and holds its secrets — so this grants nothing new.

Undeclared events currently pass `send` unchecked. They stay allowed for now
(nothing declared yet would break), and closing that is a separate change.

## Incoming: a webhook is a trigger source

A provider pushing events to us is the same thing as any other trigger source
producing events: it just arrives over HTTP. So incoming webhooks are a kind of
trigger source, next to the existing one, and consumers stay plain triggers.
This is how n8n (`webhook()` beside `trigger()` and `poll()`), Activepieces
(`TriggerStrategy.WEBHOOK | POLLING`) and Zapier (`hook | polling`) model it.

Three wires, one per kind, so each has its own shape and errors:

| Wire                       | Lowers onto                                             | Runs                    |
| -------------------------- | ------------------------------------------------------- | ----------------------- |
| `wireTriggerSource`        | unchanged: a long-lived subscription returning teardown | trigger worker          |
| `wireTriggerWebhookSource` | an HTTP route, `auth: false`                            | every API instance      |
| `wireTriggerPollSource`    | a scheduled task `trigger-poll:<source>`                | wherever schedulers run |

Webhook and poll sources lower onto routes and scheduled tasks the deploy
analyzer already handles, so no deploy target changes. A source with no wired
trigger lowers onto nothing.

### Events

Every kind produces `{ name, id?, data }`. The source declares what it can
produce as Zod schemas; triggers subscribe by `<source>:<event>`:

```ts
wireTriggerWebhookSource({
  name: 'stripe',
  events: {
    'checkout.session.completed': CheckoutSessionSchema,
    'charge.refunded': ChargeSchema,
  },
  receive: ref('stripe-eu:receiveStripeWebhook'),
  check: ref('stripe-eu:checkStripeWebhook'),
  setup: ref('stripe-eu:setupStripeWebhook'),
  teardown: ref('stripe-eu:teardownStripeWebhook'),
})

wireTrigger({ name: 'stripe:checkout.session.completed', func: fulfilOrder })
```

- `data` is validated against the event's schema before it is enqueued; a
  malformed event is logged and dropped.
- The trigger func's input is inferred from the schema.
- The inspector reads the `events` keys statically: it rejects a trigger name
  the source cannot produce, and the events `setup` registers are exactly the
  keys some trigger is wired to. Nothing lists events by hand.

### Who wires it

The app, as with every addon function today. An addon exports `receive`,
`check`, `setup`, `teardown` and its event schemas as ordinary functions and
values; the app wires them with `ref('<instance>:<fn>')`, which runs them inside
that instance so its `secretOverrides` apply. An app's own source may inline
them instead.

### receive

`(services, { body, headers, method, url, query }) → { events } | { respond }`

- `body` is the raw bytes: providers sign those, not re-serialised JSON.
- Returns one or more events (some providers batch), or `respond` for a
  handshake (Slack `url_verification`, Meta `hub.challenge`).
- Throwing rejects the request with the error's own status
  (`UnauthorizedError` → 401). Nothing is enqueued.
- Omitted: the JSON body is one event named after the source, dispatched to a
  trigger named just `<source>`.

### Delivery: webhook → queue → worker

```
POST /webhooks/<source> → receive → validate → enqueue one job per event → 200
                                                        ↓
                          pikku-incoming-webhooks worker → wireTrigger funcs for <source>:<event>
```

`IncomingWebhookService` takes `queueService` in its constructor, as
`QueueWebhookService` does, so a source wired without a queue fails to compile.

- The provider gets its 2xx once the event is queued; a failed enqueue answers
  non-2xx so the provider retries.
- Retries of our own processing come from the queue, not from the provider.
- The job id is `<source>:<provider event id>`, which de-duplicates on queues
  that honour job ids.
- `KyselyIncomingWebhookService` extends it with a `webhookReceipt` row (raw
  body, headers, parsed events, status) unique on `(source, providerEventId)`
  — the reliable de-duplication — and a `webhookReceiptAttempt` row per
  dispatch, mirroring the outgoing tables. The console reads these.

A poll source enqueues into the same queue, so there is one dispatch path.

### Lifecycle: check, setup, teardown

Run by the CLI at deploy, never by the route:

- `check({ url, label, events, previous })` → `ok | missing | drifted` — the
  read-only preview (`pikku webhooks status`) and drift detection.
- `setup({ url, label, events, previous })` → `{ status, state? }` — only when `check` is not `ok`, or always when there is no
  `check`. `manual` with instructions when the provider has no API.
- `teardown({ label, previous })` — when the stage goes away.

`url` is always the deployment's own route; nothing can point it elsewhere.
`label` is `pikku:<app>:<stage>:<source>`, for providers that let endpoints be
tagged and listed (Stripe metadata). `previous` is what the last `setup`
returned, for providers that do not: the caller stores it between deploys.

A signing secret the provider issues is written by `setup` to the credential
store (`credentialService.set`) and removed by `teardown`; `receive` reads it
per delivery through `WebhookSigningSecret.fromCredential`. A new secret takes
effect without a deploy and never passes through the CLI.

### Running it

`pikku webhooks status | setup | teardown --url <base url> --label-prefix
<app>:<stage> [--previous <file>]` loads the app with its own services and
prints one JSON line per source: `{ source, status, state?, instructions?,
error? }`.

## Fabric

- CI gets a **webhooks** phase after publish, like migrations: it runs
  `pikku webhooks setup` and posts results back.
- fabric-api stores each source's `state` as `previous` for the next deploy,
  and runs `teardown` when a stage is deleted. Signing secrets land in the
  stage's credential store through `setup` itself.
- `StageStripeSandboxService` keeps provisioning credentials and loses its
  hard-coded event map.

## Slices

1. **core** — `wireTriggerWebhookSource`, `IncomingWebhookService` and its
   queue worker, dispatch to `<source>:<event>` triggers.
2. **inspector** — source meta (`kind`, route, events, function ids), route
   synthesis, trigger-name validation, derived events.
3. **CLI** — generated route and worker wiring, `pikku webhooks status | setup |
teardown`.
4. **@pikku/kysely** — `KyselyIncomingWebhookService` and its tables.
5. **commerce-stripe** — the four functions and event schemas.
6. **Fabric** — the CI phase, stored results, the gate, removing the event map.
7. **poll sources** — `wireTriggerPollSource`, cursor in a `triggerSourceState`
   row.

Later: `invoke(name, data)` on subscription sources, shared app-level endpoints
(Slack, Meta), expiring registrations (Graph, Gmail `watch`), JSON Schema for
events in the console, moving outgoing to the same service shape.
