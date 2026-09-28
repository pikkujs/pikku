import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { added, dim } from '../lib/output.js'
import {
  searchOpenApis,
  searchPackages,
  OpenApiEntrySchema,
  PackageEntrySchema,
} from '../lib/registry.js'

export const FabricAddonSearchInput = z.object({
  query: z.string(),
  limit: z.number().optional(),
  apiUrl: z.string().optional(),
})

export const FabricAddonSearchOutputSchema = z.object({
  packages: z.array(PackageEntrySchema),
  apis: z.array(OpenApiEntrySchema),
})
export type FabricAddonSearchOutput = z.infer<typeof FabricAddonSearchOutputSchema>

/**
 * Search both registry catalogues for an external API worth wiring.
 *
 * The two are not equal and the order here is the recommendation. A published
 * addon is already built and already typed, so installing it is one step. An
 * OpenAPI spec has to be generated into an addon first, which costs a codegen
 * round and can fail on a bad spec. So the APIs are searched only to show what
 * exists beyond the published set, never as the first thing to reach for.
 */
export const FabricAddonSearch = pikkuSessionlessFunc({
  description:
    'Search the Fabric community registry for an addon or an OpenAPI spec to generate one from.',
  input: FabricAddonSearchInput,
  output: FabricAddonSearchOutputSchema,
  func: async (_services, { query, limit, apiUrl: apiUrlOverride }) => {
    const { apiUrl } = await resolveApiContext({ apiUrlOverride })
    // Both catalogues are public reads, so a failure in one is not a reason to
    // withhold the other: a published hit is the answer the caller wanted, and
    // an OpenAPI outage would otherwise hide it behind an unrelated error.
    const [packages, apis] = await Promise.all([
      searchPackages(apiUrl, query).catch(() => []),
      searchOpenApis(apiUrl, query, limit).catch(() => []),
    ])
    return { packages, apis }
  },
})

export function renderAddonSearch(
  _s: unknown,
  result: FabricAddonSearchOutput
): void {
  if (result.packages.length === 0 && result.apis.length === 0) {
    console.log(
      '\nNothing in either catalogue. Save the API\'s own OpenAPI spec and generate ' +
        'an addon from that, or write the integration by hand.\n'
    )
    return
  }
  if (result.packages.length > 0) {
    console.log(`\n${added('Published addons')} ${dim('— already built and typed')}`)
    for (const p of result.packages) {
      const id = p.id ?? p.name
      console.log(`  ${id}${p.version ? dim(`@${p.version}`) : ''}`)
      if (p.description) console.log(`    ${dim(p.description)}`)
    }
    console.log(dim('\n  Install one with `pikku fabric addon add <id>`.'))
  }
  if (result.apis.length > 0) {
    console.log(
      `\n${dim('OpenAPI specs')} ${dim('— generate an addon from these only if nothing above fits')}`
    )
    for (const a of result.apis) {
      const ops = a.totalOperations ? dim(` (${a.totalOperations} operations)`) : ''
      console.log(`  ${a.name}${ops}`)
      if (a.title) console.log(`    ${dim(a.title)}`)
    }
  }
  console.log('')
}
