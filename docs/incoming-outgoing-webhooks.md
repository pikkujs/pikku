# Incoming and outgoing webhooks

Two declarations with nothing in common but the word:

| | Outgoing | Incoming |
| --- | --- | --- |
| Declared with | `defineOutgoingWebhook` | `defineIncomingWebhook` |
| Direction | this app → a subscriber | a provider → this app |
| Declares | `event`, `title`, `description?`, `payload` | `id`, `func`, `events`, `secret`, `upsert` (`delete` later) |
| Who registers | the subscriber, at runtime | this app, at deploy time, through `upsert` |
| Metadata | `.pikku/webhooks/pikku-outgoing-webhooks-meta.gen.json` | `.pikku/webhooks/pikku-incoming-webhooks-meta.gen.json` |

`defineWebhook` only ever existed on `feat/console-ux` and was never released,
so the rename to `defineOutgoingWebhook` breaks nobody.

## Scoping

Both are scoped the same way everything else an addon owns is: by the
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
  type Prefixed<P extends string, M> = { [K in keyof M as `${P}:${K & string}`]: M[K] }
  export interface OutgoingWebhooksMap extends AppOutgoingWebhooks,
    Prefixed<'stripe-eu', StripeOutgoingWebhooksMap> {}
  ```

  The app's `send` is typed against the full map, so it can send an addon's
  event by its full name. The app is the trust root — it already calls the
  addon's functions and holds its secrets — so this grants nothing new.

Undeclared events currently pass `send` unchecked. They stay allowed for now
(nothing declared yet would break), and closing that is a separate change.

## Incoming

```ts
export const stripeCheckout = defineIncomingWebhook({
  id: 'checkout',
  func: handleStripeWebhook,
  events: ['checkout.session.completed', /* … */],
  secret: 'STRIPE_WEBHOOK_SECRET',
  needs: ['STRIPE_SECRET_KEY'],
  upsert: async ({ url, label, events, secrets }) => {
    // find by label → create, update in place, or leave alone
    return { secret: whsec }   // only when one was created
  },
})
```

### The URL is never a parameter

The route is generated:

```
https://<stage-host>/api/webhooks/<instance>/<id>   addon
https://<stage-host>/api/webhooks/<id>              app
```

`upsert` receives the full `url`; nothing in a declaration can point it
elsewhere. The route is mounted automatically for every wired instance, with
`auth: false` — verification is the signing secret, not a session. The app (not
an addon) may override `route`, which is how a library with a fixed path (Better
Auth Stripe at `/auth/stripe/webhook`) is wrapped without moving its handler.

The inspector rejects an app webhook id that equals an addon instance name, and
two declarations with the same scoped id.

### Upsert, not setup

It runs on every deploy and converges:

- find the provider's resource by `label` (`pikku:<app>:<stage>:<scoped id>`);
- missing → create, return the new signing secret;
- present but different (url, events) → update in place, return nothing;
- present and equal → return nothing.

There is no local state file. The provider is the state; the label is the key. A
lost signing secret means delete-and-recreate, i.e. rotate.

### Secrets

`secret` and `needs` are the addon's own secret names. The metadata records them
resolved through the instance's `secretOverrides`, so whoever runs `upsert`
never has to know about the renaming: it fetches what the entry says it needs
and writes what the entry says it produces.

### Metadata

`pikku-incoming-webhooks-meta.gen.json`, keyed by scoped id:

```json
{
  "stripe-eu:checkout": {
    "id": "checkout",
    "instance": "stripe-eu",
    "package": "@pikku/addon-commerce-stripe",
    "pikkuFuncId": "stripe-eu:handleStripeWebhook",
    "route": "/webhooks/stripe-eu/checkout",
    "events": ["checkout.session.completed"],
    "secret": "STRIPE_EU_WEBHOOK_SECRET",
    "needs": ["STRIPE_EU_SECRET_KEY"]
  }
}
```

### Running it

`pikku webhooks upsert --url <base url> --label-prefix <app>:<stage>` imports
every declaration, runs each `upsert` with only the secrets it `needs` (read from
the environment), and prints one JSON line per webhook:
`{ id, status: 'unchanged' | 'created' | 'updated' | 'failed', secret?, error? }`.
Produced secrets go to stdout only for the caller to store; nothing is written
to disk.

## Fabric

- CI gets a **webhooks** phase after publish, like migrations: fabric-api hands
  it exactly the secrets the metadata `needs` (scoped deploy-token endpoint),
  CI runs `pikku webhooks upsert`, and posts results back.
- fabric-api writes produced secrets to the stage and keeps an applied row per
  stage and webhook (`pending` / `active` / `failed`).
- The deploy config gate treats a secret some incoming webhook produces as
  covered.
- `StageStripeSandboxService` keeps provisioning credentials (claimable
  sandboxes / the stand-in key) and loses its hard-coded event map.

## Slices

1. **pikku OSS** — `defineOutgoingWebhook` (ported from `feat/console-ux`,
   renamed), `defineIncomingWebhook`, inspector + metadata for both, automatic
   route mounting, addon scoping for both, `pikku webhooks upsert`.
2. **commerce-stripe** — its `defineIncomingWebhook` with a Stripe `upsert`; the
   README drops the manual `wireHTTP`.
3. **Fabric** — the CI phase, the scoped-secret endpoint, the applied row, the
   gate change, removing the event map.

Later: `delete` and pruning, a provider with no API (tell the user what to set
by hand), Better Auth Stripe detection, the console pages.
