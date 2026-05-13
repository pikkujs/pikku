import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { findProjectConfig, resolveApiContext } from '../lib/config.js'
import { getRpc } from '../lib/http.js'

export const FabricDomainsApplyInput = z.object({
  apiUrl: z.string().optional(),
})

export const FabricDomainsApplyOutput = z.object({
  added: z.number(),
  removed: z.number(),
})

/**
 * Reconcile the production stage's custom hostnames against
 * `fabric.config.json` — registers missing ones with CF for SaaS, removes
 * ones the config no longer lists. Newly-registered hostnames will need DNS
 * records added at the user's registrar (printed below per row).
 */
export const FabricDomainsApply = pikkuSessionlessFunc({
  description: 'Apply custom-hostname changes for the linked project.',
  input: FabricDomainsApplyInput,
  output: FabricDomainsApplyOutput,
  func: async (_services, { apiUrl: apiUrlOverride }) => {
    const ctx = await resolveApiContext({ apiUrlOverride })
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')

    const local = await findProjectConfig()
    if (!local)
      throw new Error(
        'No fabric.config.json found. Run `pikku fabric link` first.'
      )

    const rpc = getRpc({ apiUrl: ctx.apiUrl, token: ctx.token })
    const result = await rpc.invoke('applyProjectDomains', {
      projectId: local.config.projectId,
      config: {
        apps: local.config.apps,
        production: local.config.production,
      },
      dryRun: false,
    })

    console.log('')
    console.log(`Project: ${local.config.projectId}`)
    if (result.adds.length === 0 && result.removes.length === 0) {
      console.log('  No changes.')
    } else {
      for (const a of result.adds) {
        console.log(`  ✓ added   ${a.hostname}  (${a.target})`)
        console.log(`            CNAME: ${a.hostname}  →  ${a.cnameTarget}`)
        if (a.ownershipVerification?.name) {
          console.log(
            `            Ownership: ${a.ownershipVerification.type ?? 'TXT'} ${a.ownershipVerification.name} = ${a.ownershipVerification.value}`
          )
        }
      }
      for (const r of result.removes) {
        console.log(`  ✓ removed ${r.hostname}`)
      }
    }
    console.log('')

    return {
      added: result.adds.length,
      removed: result.removes.length,
    }
  },
})
