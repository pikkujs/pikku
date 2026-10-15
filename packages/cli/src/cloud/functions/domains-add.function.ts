import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { CloudPreconditionError } from '../../utils/precondition-error.js'

export const CloudDomainsAddInput = z.object({
  hostname: z.string(),
  target: z.enum(['api', 'app']).optional(),
  apiUrl: z.string().optional(),
})

export const CloudDomainsAddOutput = z.object({
  hostname: z.string(),
  cnameTarget: z.string(),
})

export const CloudDomainsAdd = pikkuSessionlessFunc({
  description: 'Add a custom domain to the production stage.',
  input: CloudDomainsAddInput,
  output: CloudDomainsAddOutput,
  func: async (
    _services,
    { hostname, target = 'api', apiUrl: apiUrlOverride }
  ) => {
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
      throw new CloudPreconditionError(
        'No production stage exists yet — deploy the project first.'
      )

    const result = await rpc.invoke('addStageCustomHostname', {
      stageId: production.stageId,
      hostname,
      target,
    })

    console.log('')
    console.log(`  ✓ added   ${hostname}  (${target})`)
    console.log(`            CNAME: ${hostname}  →  ${result.cnameTarget}`)
    if (result.ownershipVerification?.name) {
      console.log(
        `            Ownership: ${result.ownershipVerification.type ?? 'TXT'} ${result.ownershipVerification.name} = ${result.ownershipVerification.value}`
      )
    }
    console.log('')

    return { hostname, cnameTarget: result.cnameTarget }
  },
})
