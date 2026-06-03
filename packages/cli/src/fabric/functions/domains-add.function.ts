import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { findProjectConfig, resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'

export const FabricDomainsAddInput = z.object({
  hostname: z.string(),
  target: z.enum(['api', 'app']).optional(),
  apiUrl: z.string().optional(),
})

export const FabricDomainsAddOutput = z.object({
  hostname: z.string(),
  cnameTarget: z.string(),
})

export const FabricDomainsAdd = pikkuSessionlessFunc({
  description: 'Add a custom domain to the production stage.',
  input: FabricDomainsAddInput,
  output: FabricDomainsAddOutput,
  func: async (
    _services,
    { hostname, target = 'api', apiUrl: apiUrlOverride }
  ) => {
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
    if (!production)
      throw new Error(
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
