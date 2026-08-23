import { pikkuVoidFunc } from '#pikku/function'
import { isExpectedError } from '#pikku/error'

/**
 * One pass over the items that need attention, firing the handler for each.
 *
 * This was a `setInterval` inside a trigger source — the scheduler reimplemented
 * badly. It could not be invoked once, so nothing tested it, an operator could
 * not force it, and calling it would have leaked a timer per call.
 */
// @snippet start rpcInternalCall
// Call another Pikku function by name from inside any function — fully typed,
// and the same call whether the target is local or in another deployed unit.
//
// The example used to be `createOrderWithValidation`, which invoked `getBasket`
// and returned `{ valid: true }` unconditionally. It was wired to nothing, so
// the documented way to call a function was demonstrated by a function nobody
// could call.
export const sweepLowStock = pikkuVoidFunc({
  // Exposed so an operator can force a pass and a scenario can prove it works.
  expose: true,
  func: async ({ kysely, logger }, _data, { rpc }) => {
    const rows = await kysely
      .selectFrom('item')
      .select(['itemId', 'name', 'stock'])
      .where('stock', '<=', 5)
      .where('isActive', '=', 1)
      .execute()

    for (const row of rows) {
      // @snippet start isExpectedError
      try {
        await rpc.invoke('onLowStock', {
          itemId: row.itemId,
          name: row.name,
          stock: row.stock,
        })
      } catch (error) {
        // An error pikku knows about carries a status and a message meant for
        // the caller; anything else is a bug and belongs on the floor.
        if (!isExpectedError(error)) throw error
        logger.warn({ event: 'low_stock_alert_failed', itemId: row.itemId })
      }
      // @snippet end isExpectedError
    }

    logger.info({ event: 'low_stock_swept', noticed: rows.length })
  },
})
// @snippet end rpcInternalCall
