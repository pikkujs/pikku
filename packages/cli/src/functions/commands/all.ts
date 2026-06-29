import { pikkuVoidFunc } from '#pikku'

export const all = pikkuVoidFunc({
  remote: true,
  func: async (services, _data, { rpc }) => {
    await services.workflowService.runToCompletion('allWorkflow', {}, rpc)
  },
})
