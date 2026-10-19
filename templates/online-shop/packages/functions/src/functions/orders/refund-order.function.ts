import { z } from 'zod'
import { pikkuFunc, pikkuApprovalDescription } from '#pikku/function'

export const RefundOrderInput = z.object({ orderId: z.string() })

// @snippet start approvalDescription
export const refundOrderApproval = pikkuApprovalDescription(
  async ({ kysely }, { orderId }: z.infer<typeof RefundOrderInput>) => {
    const order = await kysely
      .selectFrom('order')
      .select(['totalCents'])
      .where('orderId', '=', orderId)
      .executeTakeFirst()
    return order
      ? `Refund order ${orderId} (${(order.totalCents / 100).toFixed(2)})`
      : `Refund order ${orderId}`
  }
)

// @coverage-unreachable only an agent with an explicit approval policy reaches this, and only after a person approves it
export const refundOrder = pikkuFunc({
  description: 'Refund an order that has already been paid.',
  input: RefundOrderInput,
  approvalRequired: true,
  approvalDescription: refundOrderApproval,
  func: async ({ kysely }, { orderId }) => {
    await kysely
      .updateTable('order')
      .set({ status: 'refunded', updatedAt: new Date().toISOString() })
      .where('orderId', '=', orderId)
      .execute()
  },
})
// @snippet end approvalDescription
