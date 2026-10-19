import { wireTrigger } from '#pikku/trigger/pikku-trigger-types.gen.js'
import { wireScheduler } from '#pikku/scheduler'
import { onWebhookReceived } from '../functions/on-webhook-received.function.js'
import { sweepPendingWebhooks } from '../functions/sweep-pending-webhooks.function.js'

// @snippet start wireTrigger
// The handler is in its own file — Pikku resolves trigger metadata per file, so
// declaring it beside the wiring gets it skipped as "metadata not found".
wireTrigger({
  name: 'automation-due',
  func: onWebhookReceived,
})

// A scheduled task, not a `setInterval` inside a trigger source. Clock-driven
// work is what `wireScheduler` is for: one pass, callable by hand, provable.
wireScheduler({
  name: 'sweepPendingWebhooks',
  schedule: '*/5 * * * *',
  func: sweepPendingWebhooks,
})
// @snippet end wireTrigger
