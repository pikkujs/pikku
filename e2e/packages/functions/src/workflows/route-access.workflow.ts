import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

/** Marked neither way, so no generated route reaches it. */
export const routeHiddenWorkflow = pikkuWorkflowFunc<
  { value: number },
  { doubled: number }
>({
  func: async ({}, data, { workflow }) => {
    const doubled = await workflow.do('Double value', 'doubleValue', {
      value: data.value,
    })
    await workflow.do('Format message', 'formatMessage', {
      greeting: 'Hello',
      name: 'route access',
    })
    return { doubled: doubled.result }
  },
})

/** A signed-in caller reaches it; an anonymous one does not. */
export const routeExposedWorkflow = pikkuWorkflowFunc<
  { value: number },
  { doubled: number }
>({
  expose: true,
  func: async ({}, data, { workflow }) => {
    const doubled = await workflow.do('Double value', 'doubleValue', {
      value: data.value,
    })
    await workflow.do('Format message', 'formatMessage', {
      greeting: 'Hello',
      name: 'route access',
    })
    return { doubled: doubled.result }
  },
})

/** `auth: false`: the same routes take an anonymous caller. */
export const routePublicWorkflow = pikkuWorkflowFunc<
  { value: number },
  { doubled: number }
>({
  expose: true,
  auth: false,
  func: async ({}, data, { workflow }) => {
    const doubled = await workflow.do('Double value', 'doubleValue', {
      value: data.value,
    })
    await workflow.do('Format message', 'formatMessage', {
      greeting: 'Hello',
      name: 'route access',
    })
    return { doubled: doubled.result }
  },
})
