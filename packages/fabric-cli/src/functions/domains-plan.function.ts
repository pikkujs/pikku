import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'
import { findProjectConfig, resolveApiContext } from '../lib/config.js'
import { getRpc } from '../lib/http.js'

export const FabricDomainsPlanInput = z.object({
  apiUrl: z.string().optional(),
})

export const FabricDomainsPlanOutput = z.object({
  adds: z.number(),
  removes: z.number(),
  keeps: z.number(),
})

/**
 * Show the diff between `fabric.config.json` and the production stage's
 * currently-registered custom hostnames. Doesn't change anything.
 */
export const FabricDomainsPlan = pikkuSessionlessFunc({
  description: 'Plan custom-hostname changes for the linked project.',
  input: FabricDomainsPlanInput,
  output: FabricDomainsPlanOutput,
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
      dryRun: true,
    })

    console.log('')
    console.log(`Project: ${local.config.projectId}`)
    if (result.adds.length === 0 && result.removes.length === 0) {
      console.log(
        '  No changes — production custom hostnames already match fabric.config.json.'
      )
    } else {
      for (const a of result.adds) {
        console.log(
          `  + ${a.hostname.padEnd(40)} (${a.target}${a.isPrimary ? ', primary' : ''})`
        )
        console.log(`      CNAME → ${a.cnameTarget}`)
      }
      for (const r of result.removes) {
        console.log(`  - ${r.hostname.padEnd(40)} (${r.target})`)
      }
    }
    if (result.keeps.length > 0) {
      console.log('')
      console.log(`  ${result.keeps.length} unchanged.`)
    }
    console.log('')
    console.log('Run `pikku fabric domainsApply` to apply.')

    return {
      adds: result.adds.length,
      removes: result.removes.length,
      keeps: result.keeps.length,
    }
  },
})
