import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

export const StreamOrderPreparationInput = z.object({ orderId: z.string() })

export const StreamOrderPreparationOutput = z.object({
  status: z.enum(['started', 'picking', 'complete']),
  picked: z.number(),
  total: z.number(),
  itemName: z.string().nullable(),
})

/**
 * Stream a packing list to the shopper as each line is picked.
 *
 * One way, server to client, over a plain GET — which is why this is SSE and
 * not a channel: the shopper sends nothing back. The same function still
 * answers as an ordinary RPC, returning only the final frame, so a client that
 * cannot hold a stream open is not locked out.
 */
export const streamOrderPreparation = pikkuFunc({
  expose: true,
  description: 'Watch an order being picked, line by line.',
  input: StreamOrderPreparationInput,
  output: StreamOrderPreparationOutput,
  scopes: ['orders:read'],
  func: async ({ kysely }, { orderId }, { session, channel }) => {
    const order = await kysely
      .selectFrom('order')
      .select(['orderId', 'userId'])
      .where('orderId', '=', orderId)
      .executeTakeFirst()

    if (!order) throw new Error('Order not found')
    if (order.userId !== session.userId && session.role !== 'admin') {
      throw new Error('Forbidden')
    }

    const lines = await kysely
      .selectFrom('orderItem')
      .innerJoin('item', 'item.itemId', 'orderItem.itemId')
      .select(['item.name', 'orderItem.quantity'])
      .where('orderItem.orderId', '=', orderId)
      .execute()

    const total = lines.reduce((sum, line) => sum + line.quantity, 0)

    // `channel` is present only when the request arrived on the SSE route.
    if (channel) {
      channel.send({ status: 'started', picked: 0, total, itemName: null })
      let picked = 0
      for (const line of lines) {
        picked += line.quantity
        channel.send({
          status: 'picking',
          picked,
          total,
          itemName: line.name,
        })
      }
    }

    return { status: 'complete' as const, picked: total, total, itemName: null }
  },
})
