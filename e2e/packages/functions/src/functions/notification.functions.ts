import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'

export const notifyShopper = pikkuSessionlessFunc<
  { orderId: string; recipient?: string },
  { messageId: string | null }
>({
  expose: true,
  func: async ({ emailService }, { orderId, recipient }) => {
    const result = await emailService?.send({
      to: recipient ?? 'shopper@actors.local',
      subject: `Order ${orderId} update`,
      text: 'Your order has shipped.',
    })
    return { messageId: result?.messageId ?? null }
  },
})
