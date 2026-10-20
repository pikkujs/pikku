/**
 * One addon workflow starting another by its bare name. The child's meta lives
 * under this package, not the app's, and the parent's step still has to start
 * it as a child run, with its own `workflow` wire.
 */
import { pikkuSessionlessFunc } from '../../.pikku/addon/function/index.js'
import { pikkuWorkflowFunc } from '../../.pikku/addon/workflow/pikku-workflow-types.gen.js'

export const probeBuildHost = pikkuSessionlessFunc<
  { host: string },
  { ready: boolean; host: string }
>({
  func: async (_services, { host }) => ({ ready: true, host }),
})

export const waitForBuildHost = pikkuWorkflowFunc<
  { host: string },
  { ready: boolean; host: string }
>(async (_services, data, { workflow }) => {
  await workflow.do('Probe build host', 'probeBuildHost', data)
  return await workflow.do('Confirm build host', 'probeBuildHost', data)
})

export const deployWorkflow = pikkuWorkflowFunc<
  { host: string },
  { deployed: boolean; buildHost: { ready: boolean; host: string } }
>(async (_services, data, { workflow }) => {
  const buildHost = await workflow.do(
    'Wait for build host',
    'waitForBuildHost',
    data
  )
  await workflow.do('Check build host', 'probeBuildHost', data)
  return { deployed: true, buildHost }
})
