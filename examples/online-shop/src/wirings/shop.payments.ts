import { wireAddon } from '#pikku/addon'
import { ref } from '#pikku/function'
import { wireHTTP } from '#pikku/http'
import { wireQueueWorker } from '#pikku/queue/pikku-queue-types.gen.js'
import type { STRIPE_WEBHOOK_QUEUE } from '@pikku/addon-stripe'
import { applyStripeEvent } from '../functions/orders/apply-stripe-event.function.js'

/**
 * Payments are Stripe's, not ours.
 *
 * This template used to hand-roll the lot: a `FakePaymentService`, a `chargeCard`
 * that called it, and a `/webhooks/payment` route with its own invented event
 * shape and — the part that mattered — no signature verification at all. Anyone
 * who could reach the URL could mark any order paid.
 *
 * `@pikku/addon-stripe` is the payments story. Its webhook receiver verifies the
 * signature against the raw request bytes and `STRIPE_WEBHOOK_SECRET`, publishes
 * the verified event onto a queue, and returns 200 immediately. Mapping an event
 * to this shop's orders happens in the queue worker, where a retry is free and a
 * slow database does not make Stripe think the endpoint is down.
 *
 * ---------------------------------------------------------------------------
 * KNOWN COMPROMISE — read before copying this into anything that takes money.
 * ---------------------------------------------------------------------------
 *
 * `payments:charge` is granted to the customer role, because a shopper has to be
 * able to charge their own card to check out. `wireAddon`'s `scopes` is required
 * of EVERY function in the addon (see its docstring), and this addon declares no
 * per-function scopes of its own — so one gate covers `paymentIntentCreate`,
 * `refundCreate`, `customerDelete` and the rest alike.
 *
 * The consequence, stated plainly: any signed-in customer can call any Stripe
 * function this addon exposes, over `POST /rpc/:rpcName`. Including refunds.
 *
 * The alternatives were worse, not better. Gating on `orders` — support-and-
 * admin authority — breaks checkout, because `chargeCard` runs with the
 * shopper's session and `rpc.invoke` propagates it; core has no elevated or
 * system-authority invoke, so there is no way for one of our functions to reach
 * the addon with more authority than its caller. Elevating the session inside
 * `chargeCard` would work and would be worse: authority that a reader of the
 * scope declarations cannot see.
 *
 * Two things resolve it properly, and both are upstream:
 *   1. per-function scopes on addon functions, so `refundCreate` can require
 *      `payments:manage` while `paymentIntentCreate` requires `payments:charge`;
 *   2. an internal invoke that does not carry the caller's authority, so the
 *      addon gate governs `/rpc/:rpcName` and not our own call path.
 *
 * Until one of those exists, treat `payments:manage` as the real boundary and do
 * not grant `payments` (the parent, which satisfies both children) to anybody
 * who should not be issuing refunds.
 */
wireAddon({
  name: 'stripe',
  package: '@pikku/addon-stripe',
  scopes: ['payments:charge'],
})

/**
 * Stripe's own receiver, on our route.
 *
 * `auth: false` because Stripe has no session — but unlike the hand-rolled
 * route this replaces, it is not unauthenticated: the handler verifies the
 * signature against the raw bytes and `STRIPE_WEBHOOK_SECRET` before it does
 * anything, and publishes onto `stripe-webhook-event` for the worker below.
 */
wireHTTP({
  method: 'post',
  route: '/webhooks/stripe',
  func: ref('stripe:stripeWebhookHandler'),
  auth: false,
})

/**
 * The domain half. The addon deliberately stops at "verified event on a queue"
 * — it knows Stripe, not this shop — so mapping an event to an order is ours.
 */
// The literal, not the addon's constant: the inspector reads wiring identity
// statically from source, and a reference is keyed by its identifier text — the
// wiring would be silently skipped at runtime (PKU118). The assertion below is
// what stops the two drifting apart, since the literal is now unchecked.
const STRIPE_QUEUE: typeof STRIPE_WEBHOOK_QUEUE = 'stripe-webhook-event'
void STRIPE_QUEUE

wireQueueWorker({
  name: 'stripe-webhook-event',
  func: applyStripeEvent,
})
