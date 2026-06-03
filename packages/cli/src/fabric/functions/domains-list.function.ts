import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { findProjectConfig, resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'

export const FabricDomainsListInput = z.object({
  apiUrl: z.string().optional(),
})

export const FabricDomainsListOutput = z.object({
  count: z.number(),
})

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
      console.log('')
      console.log(`Project: ${local.config.projectId}`)
      console.log('  No production stage exists yet.')
      console.log('')
      return { count: 0 }
    }

    const result = await rpc.invoke('listStageCustomHostnames', {
      stageId: production.stageId,
    })

    console.log('')
    console.log(`Project: ${local.config.projectId}`)
    if (result.hostnames.length === 0) {
      console.log('  No custom domains attached.')
    } else {
      for (const h of result.hostnames) {
        console.log(
          `  ${h.hostname.padEnd(40)} ${h.target.padEnd(4)}  ${h.status.padEnd(12)}  CNAME → ${h.cnameTarget}`
        )
      }
    }
    console.log('')

    return { count: result.hostnames.length }
  },
})
