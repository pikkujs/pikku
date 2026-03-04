import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const dslRetryUnhappyWorkflow = pikkuWorkflowFunc<
  { value: number },
  { result: number }
>({
  func: async ({}, data, { workflow }) => {
    const result = await workflow.do('Always fails', 'alwaysFails', data, {
      retries: 2,
      retryDelay: '1s',
    })
    return { result: result.result }
  },
  tags: ['retry', 'unhappy'],
})
