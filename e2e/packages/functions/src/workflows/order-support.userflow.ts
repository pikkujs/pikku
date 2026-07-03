import { pikkuUserFlow } from '#pikku/workflow/pikku-workflow-types.gen.js'

/**
 * UI-fixture user flow: gives the console a user flow with two actors so the
 * Workflows page's User Flows / Personas views have something to render.
 * Runnable via `pikku userflow run` too — the steps are plain exposed RPCs.
 */
export const orderSupportUserFlow = pikkuUserFlow<
  { value: number },
  { doubled: number; message: string }
>({
  title: 'Order support (user flow)',
  tags: ['user-flow'],
  func: async ({ logger }, data, { workflow, actors }) => {
    if (!actors?.shopper || !actors?.support) {
      throw new Error(
        'orderSupportUserFlow needs run actors (shopper + support) — run via `pikku userflow run <environment>`'
      )
    }
    logger.debug('order-support user flow starting')

    const doubled = await workflow.do(
      'shopper doubles their order',
      'doubleValue',
      { value: data.value },
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
