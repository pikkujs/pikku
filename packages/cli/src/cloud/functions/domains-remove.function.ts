import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { CloudPreconditionError } from '../../utils/precondition-error.js'

export const CloudDomainsRemoveInput = z.object({
  hostname: z.string(),
  apiUrl: z.string().optional(),
})

export const CloudDomainsRemoveOutput = z.object({
  removed: z.boolean(),
})

export const CloudDomainsRemove = pikkuSessionlessFunc({
  description: 'Remove a custom domain from the production stage.',
  input: CloudDomainsRemoveInput,
  output: CloudDomainsRemoveOutput,
  func: async (_services, { hostname, apiUrl: apiUrlOverride }) => {
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
    if (!production)
      throw new CloudPreconditionError('No production stage found.')

    const hostnamesResult = await rpc.invoke('listStageCustomHostnames', {
      stageId: production.stageId,
    })
    const match = hostnamesResult.hostnames.find(
      (h) => h.hostname === hostname.toLowerCase()
    )
    if (!match)
      throw new CloudPreconditionError(
        `Hostname "${hostname}" is not attached to this project.`
      )

    await rpc.invoke('removeStageCustomHostname', {
      customHostnameId: match.customHostnameId,
    })

    console.log('')
    console.log(`  ✓ removed ${hostname}`)
    console.log('')

    return { removed: true }
  },
})
