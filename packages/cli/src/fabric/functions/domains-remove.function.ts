import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { PreconditionError } from '../../utils/precondition-error.js'

export const FabricDomainsRemoveInput = z.object({
  hostname: z.string(),
  apiUrl: z.string().optional(),
})

export const FabricDomainsRemoveOutput = z.object({
  removed: z.boolean(),
})

export const FabricDomainsRemove = pikkuSessionlessFunc({
  description: 'Remove a custom domain from the production stage.',
  input: FabricDomainsRemoveInput,
  output: FabricDomainsRemoveOutput,
  func: async (_services, { hostname, apiUrl: apiUrlOverride }) => {
    const ctx = await resolveApiContext({ apiUrlOverride })
    if (!ctx.token)
      throw new PreconditionError(
        'Not logged in. Run `pikku fabric login` first.'
      )

    const projectId = ctx.projectId
    if (!projectId)
      throw new PreconditionError(
        'No fabric project linked. Run `pikku fabric link` first.'
      )

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })

    const stagesResult = await rpc.invoke('listStages', {
      projectId,
    })
    const production = stagesResult.stages.find((s) => s.type === 'production')
    if (!production)
      throw new PreconditionError('No production stage found.')

    const hostnamesResult = await rpc.invoke('listStageCustomHostnames', {
      stageId: production.stageId,
    })
    const match = hostnamesResult.hostnames.find(
      (h) => h.hostname === hostname.toLowerCase()
    )
    if (!match)
      throw new PreconditionError(
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
