import { pikkuWorkflowComplexFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const complexInlineWorkflow = pikkuWorkflowComplexFunc<
  { items: number[] },
  { processed: number[]; count: number }
>(async ({}, data, { workflow }) => {
  const results = await Promise.all(
    data.items.map(
      async (item) =>
        await workflow.do(`Double ${item}`, 'doubleValue', { value: item })
    )
  )

  const nums = results.map((r) => r.result)
  const filtered = nums.filter((n) => n > 10)
  const count = await workflow.do('Count filtered', async () => filtered.length)

  return { processed: filtered, count }
})
