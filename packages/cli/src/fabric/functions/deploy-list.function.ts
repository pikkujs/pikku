import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { getRpc } from '../lib/http.js'
import { resolveStageId } from '../lib/stage.js'
import { table, statusColor, dim } from '../lib/output.js'

export const FabricDeployListInput = z.object({
  branch: z.string().default('main'),
})

export const FabricDeployListOutput = z.object({
  branch: z.string(),
  deployments: z.array(z.any()),
})

export const FabricDeployList = pikkuSessionlessFunc({
  description: 'List recent deployments for a branch',
  input: FabricDeployListInput,
  output: FabricDeployListOutput,
  func: async (_services, { branch }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    if (!ctx.projectId)
      throw new Error('No fabric project linked. Run `pikku fabric link` first.')

    const rpc = getRpc({ apiUrl: ctx.apiUrl, token: ctx.token })
    const stageId = await resolveStageId(rpc, ctx.projectId, branch)
    const { deployments } = await rpc.invoke('listDeployments', { stageId })
    return { branch, deployments }
  },
})

type DeploymentRow = {
  deploymentId: string
  status: string
  gitSha?: string | null
  versionMajor: number
  versionMinor: number
  versionPatch: number
  triggeredBy?: string | null
  trigger: string
  deployedAt?: string | null
  createdAt: string
}

export const renderDeployList = (
  _s: unknown,
  { branch, deployments }: { branch: string; deployments: DeploymentRow[] }
): void => {
  if (deployments.length === 0) {
    console.log(dim(`No deployments for ${branch}.`))
    return
  }
  console.log(
    table(
      ['DEPLOYMENT', 'STATUS', 'SHA', 'VER', 'BY', 'WHEN'],
      deployments.map((d) => [
        d.deploymentId,
        statusColor(d.status === 'suspended' ? 'planned' : d.status),
        (d.gitSha ?? '').slice(0, 7),
        `${d.versionMajor}.${d.versionMinor}.${d.versionPatch}`,
        d.triggeredBy ?? d.trigger,
        d.deployedAt ?? d.createdAt,
      ])
    )
  )
}
