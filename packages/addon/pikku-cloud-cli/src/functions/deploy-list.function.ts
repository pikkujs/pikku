import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { autoDeployOffHints, resolveStageId } from '../lib/stage.js'
import { table, statusColor, dim } from '@pikku/cli/addon-support'
import { CloudPreconditionError } from '@pikku/cli/addon-support'

export const CloudDeployListInput = z.object({
  branch: z.string().default('main'),
})

export const CloudDeployListOutput = z.object({
  branch: z.string(),
  deployments: z.array(z.any()),
  hints: z.array(z.string()),
})

export const CloudDeployList = pikkuSessionlessFunc({
  description: 'List recent deployments for a branch',
  input: CloudDeployListInput,
  output: CloudDeployListOutput,
  func: async (_services, { branch }) => {
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
    const stageId = await resolveStageId(rpc, ctx.projectId, branch)
    const { deployments } = await rpc.invoke('listDeployments', { stageId })
    const hints = deployments.some((d) => d.status === 'suspended')
      ? await autoDeployOffHints(rpc, ctx.projectId, branch)
      : []
    return { branch, deployments, hints }
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
  {
    branch,
    deployments,
    hints,
  }: { branch: string; deployments: DeploymentRow[]; hints: string[] }
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
  for (const hint of hints) console.log(dim(hint))
}
