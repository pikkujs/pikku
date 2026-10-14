import { pikkuScenario } from '#pikku/scenario'

export const orderSupportScenario = pikkuScenario<
  { value?: number },
  { doubled: number; message: string }
>({
  title: 'Order support (scenario)',
  tags: ['scenario'],
  func: async ({ logger }, data, { scenario, virtualUsers }) => {
    if (!virtualUsers?.shopper || !virtualUsers?.support) {
      throw new Error(
        'orderSupportScenario needs run virtual users (shopper + support) — run via `pikku scenario run <environment>`'
      )
    }
    logger.debug('order-support scenario starting')

    const value = data?.value ?? 21

    const doubled = await scenario.do(
      'shopper doubles their order',
      'doubleValue',
      { value },
      { virtualUser: virtualUsers.shopper }
    )

    const settled = await scenario.expectEventually(
      'support sees the greeting settle',
      'formatMessage',
      { greeting: 'Hello', name: 'Support' },
      (out: { message: string }) => out.message.length > 0,
      { virtualUser: virtualUsers.support, within: '5s', interval: 50 }
    )

    return { doubled: doubled.result, message: settled.message }
  },
})
