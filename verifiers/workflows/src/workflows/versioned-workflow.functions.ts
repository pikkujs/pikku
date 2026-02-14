import { pikkuWorkflowFunc } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const versionedItemWorkflow = pikkuWorkflowFunc<
  { itemId: string },
  { result: string; version: number }
>({
  title: 'Versioned Item Workflow',
  func: async (_services, data, { workflow }) => {
    const item = await workflow.do('Process item', 'processItem', {
      itemId: data.itemId,
    })
    return { result: item.result, version: item.version }
  },
})
