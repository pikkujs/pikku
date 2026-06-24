import { pikkuVoidFunc } from '#pikku'

export const all = pikkuVoidFunc({
  remote: true,
  func: async ({ workflowService }, _data, { rpc }) => {
    await workflowService.runToCompletion('allWorkflow', {}, rpc)
  },
})
