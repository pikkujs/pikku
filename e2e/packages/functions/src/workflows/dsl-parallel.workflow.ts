import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const dslParallelWorkflow = pikkuWorkflowFunc<
  { values: number[] },
  { results: number[]; total: number }
>(async ({}, data, { workflow }) => {
  const results = await Promise.all(
    data.values.map(
      async (v) => await workflow.do(`Double ${v}`, 'doubleValue', { value: v })
    )
  )

  const nums = results.map((r) => r.result)
  return {
    results: nums,
    total: nums.reduce((a, b) => a + b, 0),
  }
})
