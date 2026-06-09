import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { findProjectConfig, resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { dim, statusColor, table } from '../lib/output.js'

export const FabricDomainsListInput = z.object({
  apiUrl: z.string().optional(),
})

const DomainHostname = z.object({
  hostname: z.string(),
  target: z.string(),
  status: z.string(),
  cnameTarget: z.string(),
})

export const FabricDomainsListOutput = z.object({
  projectId: z.string(),
  hostnames: z.array(DomainHostname),
})

type DomainHostname = z.infer<typeof DomainHostname>

export const renderDomainsList = (
  _s: unknown,
  { projectId, hostnames }: z.infer<typeof FabricDomainsListOutput>
): void => {
  console.log(dim(`project: ${projectId}`))
  if (hostnames.length === 0) {
    console.log(dim('No custom domains attached.'))
    return
  }
  console.log(
    table(
      ['HOSTNAME', 'TARGET', 'STATUS', 'CNAME'],
      hostnames.map((h: DomainHostname) => [
        h.hostname,
        h.target,
        statusColor(h.status),
        dim(h.cnameTarget),
      ])
    )
  )
}

export const FabricDomainsList = pikkuSessionlessFunc({
  description: 'List custom domains for the linked project.',
  input: FabricDomainsListInput,
  output: FabricDomainsListOutput,
  func: async (_services, { apiUrl: apiUrlOverride }) => {
    const ctx = await resolveApiContext({ apiUrlOverride })
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')

    const local = await findProjectConfig()
    if (!local)
      throw new Error(
        'No fabric.config.json found. Run `pikku fabric link` first.'
      )

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })

    const stagesResult = await rpc.invoke('listStages', {
      projectId: local.config.projectId,
    })
    const production = stagesResult.stages.find((s) => s.type === 'production')
    if (!production) {
      return { projectId: local.config.projectId, hostnames: [] }
    }

    const result = await rpc.invoke('listStageCustomHostnames', {
      stageId: production.stageId,
    })

    return {
      projectId: local.config.projectId,
      hostnames: result.hostnames as DomainHostname[],
    }
  },
})
