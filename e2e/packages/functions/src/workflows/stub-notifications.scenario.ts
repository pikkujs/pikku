import { pikkuScenario } from '#pikku/scenario'

export const notificationScenario = pikkuScenario<null, { notified: boolean }>({
  title: 'Notification stubs (scenario)',
  tags: ['scenario', 'stubs'],
  func: async ({ logger }, _data, { scenario, virtualUsers }) => {
    if (!virtualUsers?.shopper || !virtualUsers?.support) {
      throw new Error(
        'notificationScenario needs run virtual users (shopper + support) — run via `pikku scenario run <environment>`'
      )
    }
    logger.debug('notification scenario starting')

    await scenario.do(
      'shopper triggers a shipping notification',
      'notifyShopper',
      { orderId: 'A-1' },
      { virtualUser: virtualUsers.shopper }
    )

    await scenario.expectService(
      'the email stub recorded the send',
      'emailService.send',
      {
        virtualUser: virtualUsers.shopper,
        calledWith: {
          to: 'shopper@virtualuser.local',
          subject: 'Order A-1 update',
          text: 'Your order has shipped.',
        },
      }
    )

    await scenario.expectError(
      "the support recipient's relay is fault-injected",
      'notifyShopper',
      { orderId: 'A-2', recipient: 'support@virtualuser.local' },
      { virtualUser: virtualUsers.support }
    )

    return { notified: true }
  },
})
