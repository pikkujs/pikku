import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Every kind of hop a run can take, for one trace to survive: a plain step, a
 * retry, a sleep, a step that enqueues a job, and a child workflow.
 */
export const chaosTraceChainWorkflow = pikkuWorkflowFunc<
  { tag: string },
  { tag: string }
>({
  func: async ({}, data, { workflow }) => {
    await workflow.do('First step', 'chaosStep', { key: `first:${data.tag}` })
    await workflow.do(
      'Flaky step',
      'chaosStep',
      { key: `flaky:${data.tag}`, failAttemptsBelow: 2 },
      { retries: 2, retryDelay: '100ms' }
    )
    await workflow.sleep('Short wait', '100ms')
    await workflow.do('Enqueue a job', 'chaosTraceEnqueue', { tag: data.tag })
    await workflow.do('Child workflow', 'chaosTraceChildWorkflow', {
      tag: data.tag,
    })
    return { tag: data.tag }
  },
  tags: ['chaos', 'trace'],
})

export const chaosTraceChildWorkflow = pikkuWorkflowFunc<
  { tag: string },
  { tag: string }
>({
  func: async ({}, data, { workflow }) => {
    await workflow.do('Child step', 'chaosStep', { key: `child:${data.tag}` })
    await workflow.do('Child second step', 'chaosStep', {
      key: `child-two:${data.tag}`,
    })
    return { tag: data.tag }
  },
  tags: ['chaos', 'trace'],
})
