import { pikkuVoidFunc } from '#pikku/function'

// @snippet start dailySalesReport
// @snippet start scheduledFunction
export const dailySalesReport = pikkuVoidFunc({
  // Exposed so an operator can run the sweep on demand and a scenario can
  // prove it still works. A job reachable only by its schedule is a job
  // nobody can test and nobody can force when it matters.
  expose: true,
  description: 'Cron job: compute and log a daily sales summary.',
  func: async ({ kysely, logger }) => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)
    const dayStart = yesterday.toISOString()

    const today = new Date(yesterday)
    today.setDate(today.getDate() + 1)
    const dayEnd = today.toISOString()

    const [summary, topItems] = await Promise.all([
      kysely
        .selectFrom('order')
        .select([
          (eb) => eb.fn.countAll<number>().as('orderCount'),
          (eb) => eb.fn.sum<number>('totalCents').as('revenueCents'),
        ])
        .where('status', '=', 'paid')
        .where('createdAt', '>=', dayStart)
        .where('createdAt', '<', dayEnd)
        .executeTakeFirst(),
      kysely
        .selectFrom('orderItem')
        .innerJoin('order', 'order.orderId', 'orderItem.orderId')
        .innerJoin('item', 'item.itemId', 'orderItem.itemId')
        .select([
          'item.name',
          (eb) => eb.fn.sum<number>('orderItem.quantity').as('unitsSold'),
        ])
        .where('order.status', '=', 'paid')
        .where('order.createdAt', '>=', dayStart)
        .where('order.createdAt', '<', dayEnd)
        .groupBy('orderItem.itemId')
        .orderBy('unitsSold', 'desc')
        .limit(5)
        .execute(),
    ])

    logger.info({
      event: 'daily_sales_report',
      date: yesterday.toISOString().split('T')[0],
      orders: Number(summary?.orderCount ?? 0),
      revenueCents: Number(summary?.revenueCents ?? 0),
      topItems,
    })
  },
})
// @snippet end scheduledFunction
// @snippet end dailySalesReport
