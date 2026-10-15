import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { CloudPreconditionError } from '@pikku/cli/addon-support'

export const CloudDomainsListInput = z.object({
  apiUrl: z.string().optional(),
})

export const CloudDomainsListOutput = z.object({
  count: z.number(),
})

export const CloudDomainsList = pikkuSessionlessFunc({
  description: 'List custom domains for the linked project.',
  input: CloudDomainsListInput,
  output: CloudDomainsListOutput,
  func: async (_services, { apiUrl: apiUrlOverride }) => {
    const ctx = await resolveApiContext({ apiUrlOverride })
    if (!ctx.token)
      throw new CloudPreconditionError(
        'Not logged in. Run `pikku cloud login` first.'
      )

    const projectId = ctx.projectId
    if (!projectId)
      throw new CloudPreconditionError(
        'No cloud project linked. Run `pikku cloud link` first.'
      )

    const rpc = getCloudRPC({ apiUrl: ctx.apiUrl, token: ctx.token })

    const stagesResult = await rpc.invoke('listStages', {
      projectId,
    })
    const production = stagesResult.stages.find((s) => s.type === 'production')
    if (!production) {
      console.log('')
      console.log(`Project: ${projectId}`)
      console.log('  No production stage exists yet.')
      console.log('')
      return { count: 0 }
    }

    const result = await rpc.invoke('listStageCustomHostnames', {
      stageId: production.stageId,
    })

    console.log('')
    console.log(`Project: ${projectId}`)
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
