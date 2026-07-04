import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'

/**
 * Sends a shipping notification through the email service. In normal runs the
 * service is absent (no SMTP in e2e) and the function reports messageId null;
 * under `pikku serve --test`/`--coverage` the declared test stubs
 * (src/test-services.ts) replace it, so scenarios can assert the send and
 * fault-inject failures per actor.
 */
export const notifyShopper = pikkuSessionlessFunc<
  { orderId: string },
  { messageId: string | null }
>({
  expose: true,
  func: async ({ emailService }, { orderId }) => {
    const result = await emailService?.send({
      to: 'shopper@actors.local',
      subject: `Order ${orderId} update`,
      text: 'Your order has shipped.',
    })
    return { messageId: result?.messageId ?? null }
  },
})
