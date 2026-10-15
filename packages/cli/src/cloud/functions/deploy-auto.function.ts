import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { resolveStage } from '../lib/stage.js'
import { added, dim } from '../../utils/output.js'
import { CloudPreconditionError } from '../../utils/precondition-error.js'

export const CloudDeployAutoInput = z.object({
  state: z.enum(['on', 'off']).optional(),
  branch: z.string().optional(),
})

export const CloudDeployAutoOutput = z.object({
  stages: z.array(
    z.object({ branch: z.string(), autoDeployOnPush: z.boolean() })
  ),
  protected: z.boolean().optional(),
})

export const CloudDeployAuto = pikkuSessionlessFunc({
  description:
    'Show or set whether a push to a stage’s branch deploys without waiting for approval',
  input: CloudDeployAutoInput,
  output: CloudDeployAutoOutput,
  func: async (_services, { state, branch }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new CloudPreconditionError(
        'Not logged in. Run `pikku cloud login` first.'
      )
    if (!ctx.projectId)
      throw new CloudPreconditionError(
        'No cloud project linked. Run `pikku cloud link` first.'
      )

    const rpc = getCloudRPC({ apiUrl: ctx.apiUrl, token: ctx.token })

    if (!state) {
      const { stages } = await rpc.invoke('listStages', {
        projectId: ctx.projectId,
      })
      const shown = branch ? stages.filter((s) => s.branch === branch) : stages
      if (branch && shown.length === 0)
        throw new CloudPreconditionError(
          `No stage for branch "${branch}".${stages.length ? ` Existing: ${stages.map((s) => s.branch).join(', ')}` : ''}`
        )
      return {
        stages: shown.map((s) => ({
          branch: s.branch,
          autoDeployOnPush: s.autoDeployOnPush,
        })),
      }
    }

    const stage = await resolveStage(rpc, ctx.projectId, branch)
    const result = await rpc.invoke('setStageAutoDeploy', {
      stageId: stage.stageId,
      autoDeployOnPush: state === 'on',
    })
    return {
      stages: [
        { branch: stage.branch, autoDeployOnPush: result.autoDeployOnPush },
      ],
      protected: result.protected,
    }
  },
})

export const renderDeployAuto = (
  _s: unknown,
  {
    stages,
    protected: isProtected,
  }: {
    stages: { branch: string; autoDeployOnPush: boolean }[]
    protected?: boolean
  }
): void => {
  if (stages.length === 0) {
    console.log(dim('No stages deployed for this project yet.'))
    return
  }
  console.log(
    stages
      .map(
        (s) => `${s.branch} ${s.autoDeployOnPush ? added('on') : dim('off')}`
      )
      .join(dim(' · '))
  )
  if (isProtected && stages[0]?.autoDeployOnPush)
    console.log(
      dim(
        'Deploys whose plan has problems or that drop data will still wait for approval.'
      )
    )
}
