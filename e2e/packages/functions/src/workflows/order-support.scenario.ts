import { pikkuScenario } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const orderSupportScenario = pikkuScenario<
  { value?: number },
  { doubled: number; message: string }
>({
  title: 'Order support (scenario)',
  tags: ['scenario'],
  func: async ({ logger }, data, { workflow, actors }) => {
    if (!actors?.shopper || !actors?.support) {
      throw new Error(
        'orderSupportScenario needs run actors (shopper + support) — run via `pikku scenario run <environment>`'
      )
    }
    logger.debug('order-support scenario starting')

    const value = data?.value ?? 21

    const doubled = await workflow.do(
      'shopper doubles their order',
      'doubleValue',
      { value },
      { actor: actors.shopper }
    )

    const settled = await workflow.expectEventually(
      'support sees the greeting settle',
      'formatMessage',
      { greeting: 'Hello', name: 'Support' },
      (out: { message: string }) => out.message.length > 0,
      { actor: actors.support, within: '5s', interval: 50 }
    )

    return { doubled: doubled.result, message: settled.message }
  },
})
