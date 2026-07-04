import { pikkuScenario } from '#pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Verifies declared test stubs end to end: the shopper's notification lands
 * on the recording email stub (asserted via workflow.expectService →
 * console:getStubCalls), while the support actor's relay is fault-injected
 * through pikkuTestWireServices so the error branch is reachable
 * (workflow.expectError). Requires the server to run with --test/--coverage.
 */
export const notificationScenario = pikkuScenario<null, { notified: boolean }>({
  title: 'Notification stubs (scenario)',
  tags: ['scenario', 'stubs'],
  func: async ({ logger }, _data, { workflow, actors }) => {
    if (!actors?.shopper || !actors?.support) {
      throw new Error(
        'notificationScenario needs run actors (shopper + support) — run via `pikku scenario run <environment>`'
      )
    }
    logger.debug('notification scenario starting')

    await workflow.do(
      'shopper triggers a shipping notification',
      'notifyShopper',
      { orderId: 'A-1' },
      { actor: actors.shopper }
    )

    await workflow.expectService(
      'the email stub recorded the send',
      'emailService.send',
      {
        actor: actors.shopper,
        calledWith: {
          to: 'shopper@actors.local',
          subject: 'Order A-1 update',
          text: 'Your order has shipped.',
        },
      }
    )

    await workflow.expectError(
      "the support actor's relay is fault-injected",
      'notifyShopper',
      { orderId: 'A-2' },
      { actor: actors.support }
    )

    return { notified: true }
  },
})
