import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const dslRetryHappyWorkflow = pikkuWorkflowFunc<
  { value: number },
  { result: number; attempt: number }
>({
  func: async ({}, data, { workflow }) => {
    const result = await workflow.do('Flaky step', 'flakyStep', data, {
      retries: 2,
      retryDelay: '1s',
    })
    return { result: result.result, attempt: result.attempt }
  },
  tags: ['retry', 'happy'],
})
