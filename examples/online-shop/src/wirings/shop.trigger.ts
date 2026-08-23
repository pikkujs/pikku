import {
  wireTrigger,
  wireTriggerSource,
} from '#pikku/trigger/pikku-trigger-types.gen.js'
import { wireScheduler } from '#pikku/scheduler'
import { onLowStock } from '../functions/on-low-stock.function.js'
import { sweepLowStock } from '../functions/sweep-low-stock.function.js'
import { warehouseStockFeed } from '../functions/warehouse-stock-feed.function.js'

// @snippet start wireTrigger
wireTrigger({
  name: 'low-stock',
  func: onLowStock,
})
// @snippet end wireTrigger

// @snippet start triggerSource
/**
 * A scheduled task, not a trigger source spinning its own `setInterval`.
 *
 * Noticing that stock has run low is the clock passing rather than an event
 * anybody emits, so something has to look. The original looked by starting a
 * timer inside a trigger source, which reimplemented `wireScheduler` badly: it
 * could not be invoked once, so nothing could test it, an operator had no way
 * to force a pass, and any call would have leaked an interval.
 */
wireScheduler({
  name: 'sweepLowStock',
  schedule: '*/5 * * * *',
  func: sweepLowStock,
})
// @snippet end triggerSource

// @snippet start wireTriggerSource
/**
 * The other half of the same trigger, and the shape a source is actually for:
 * something outside the app pushes, and the app listens.
 *
 * `name` is the contract — it must spell the `wireTrigger` above exactly, or
 * the two never meet. Compare the sweep: a source that starts its own timer is
 * `wireScheduler` written badly, while a source that holds a subscription is
 * the only thing that can do this at all.
 */
wireTriggerSource({
  name: 'low-stock',
  func: warehouseStockFeed,
  input: { threshold: 5 },
})
// @snippet end wireTriggerSource
