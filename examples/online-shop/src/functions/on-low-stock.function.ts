import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

export const LowStockPayload = z.object({
  itemId: z.string(),
  name: z.string(),
  stock: z.number(),
})

// @snippet start lowStockTrigger
/**
 * The handler behind the `low-stock` trigger.
 *
 * It lives here rather than beside `wireTrigger` because pikku's inspector
 * reads wiring files for wirings only: a file that both defines a function and
 * wires it produces "metadata not found" and the wiring is SKIPPED — silently,
 * at startup, with the app otherwise healthy.
 */
export const onLowStock = pikkuSessionlessFunc({
  // Exposed so the sweep can invoke it by name and a scenario can prove the
  // alert path works without waiting for stock to actually run down.
  expose: true,
  description:
    'Trigger: fires when an item stock drops below the configured threshold.',
  input: LowStockPayload,
  func: async ({ logger }, { itemId, name, stock }) => {
    logger.warn({ event: 'low_stock_alert', itemId, name, stock })
    // In production: send Slack notification, create restocking ticket, etc.
  },
})
// @snippet end lowStockTrigger
