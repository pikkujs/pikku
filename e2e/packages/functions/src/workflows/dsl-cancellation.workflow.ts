import {
  pikkuWorkflowFunc,
  WorkflowCancelledException,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

export const dslCancellationWorkflow = pikkuWorkflowFunc<
  { shouldCancel: boolean; value: number },
  { result: number }
>(async ({}, data, { workflow }) => {
  if (data.shouldCancel) {
    throw new WorkflowCancelledException('Cancelled by user')
  }
  const result = await workflow.do('Double value', 'doubleValue', {
    value: data.value,
  })
  return { result: result.result }
})
