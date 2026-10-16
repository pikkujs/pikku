import { pikkuWorkflowFunc, pikkuWorkflowGraph } from './pikku.js'

export const restockWorkflow = pikkuWorkflowFunc<
  { itemId: string; ids: string[]; urgent: boolean; mode: 'a' | 'b' },
  { done: boolean }
>({
  expose: true,
  description: 'Restock an item',
  func: async (_s, data, { workflow }) => {
    const check = await workflow.do('Check price', 'priceCheck', {
      itemId: data.itemId,
    })
    if (!check.ok) {
      await workflow.cancel('price not ok')
    }
    if (data.urgent) {
      await workflow.sleep('Wait a bit', '5s')
      await workflow.do('Notify owner', 'notifyOwner', {
        itemId: data.itemId,
        message: 'urgent',
      })
    } else {
      await workflow.do('Notify later', 'notifyOwner', {
        itemId: data.itemId,
        message: 'later',
      })
    }
    switch (data.mode) {
      case 'a':
        await workflow.do('Mode a', 'priceCheck', { itemId: 'a' })
        break
      default:
        await workflow.do('Mode default', 'priceCheck', { itemId: 'd' })
    }
    await Promise.all([
      workflow.do('Parallel one', 'priceCheck', { itemId: '1' }),
      workflow.do('Parallel two', 'priceCheck', { itemId: '2' }),
    ])
    for (const id of data.ids) {
      await workflow.do(`Check ${id}`, 'priceCheck', { itemId: id })
    }
    return { done: true }
  },
})

export const reviewGraph = pikkuWorkflowGraph({
  description: 'Review items',
  tags: ['review'],
  nodes: {
    check: 'priceCheck',
    notify: 'notifyOwner',
  },
  config: {
    check: {
      input: () => ({ itemId: 'x' }),
      next: 'notify',
    },
    notify: {
      input: (ref: any) => ({
        itemId: ref('check', 'price'),
        message: 'reviewed',
      }),
    },
  },
})
