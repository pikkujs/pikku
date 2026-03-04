import { pikkuWorkflowComplexFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const complexErrorHandlingWorkflow = pikkuWorkflowComplexFunc<
  { value: number },
  { result: number; recovered: boolean }
>(async ({}, data, { workflow }) => {
  try {
    await workflow.do('Risky step', async () => {
      throw new Error('Intentional failure')
    })
    return { result: 0, recovered: false }
  } catch {
    const fallback = await workflow.do('Fallback step', 'doubleValue', {
      value: data.value,
    })
    return { result: fallback.result, recovered: true }
  }
})
