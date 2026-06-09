import { z } from 'zod'
import chalk from 'chalk'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { findProjectConfig, resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { added, dim } from '../lib/output.js'

export const FabricDomainsAddInput = z.object({
  hostname: z.string(),
  target: z.enum(['api', 'app']).optional(),
  apiUrl: z.string().optional(),
})

export const FabricDomainsAddOutput = z.object({
  hostname: z.string(),
  target: z.string(),
  cnameTarget: z.string(),
  ownershipVerification: z
    .object({ type: z.string(), name: z.string(), value: z.string() })
    .optional(),
})

export const renderDomainsAdd = (
  _s: unknown,
  { hostname, target, cnameTarget, ownershipVerification }: z.infer<typeof FabricDomainsAddOutput>
): void => {
  console.log(added('✓') + ` ${hostname} ${dim(`(${target})`)} added`)
  console.log(dim('  CNAME:     ') + `${hostname}  →  ${chalk.bold(cnameTarget)}`)
  if (ownershipVerification) {
    console.log(
      dim(`  Ownership: ${ownershipVerification.type} `) +
        `${ownershipVerification.name} = ${chalk.bold(ownershipVerification.value)}`
    )
  }
}

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

    return {
      hostname,
      target,
      cnameTarget: result.cnameTarget,
      ownershipVerification: result.ownershipVerification?.name
        ? {
            type: result.ownershipVerification.type ?? 'TXT',
            name: result.ownershipVerification.name,
            value: result.ownershipVerification.value,
          }
        : undefined,
    }
  },
})
