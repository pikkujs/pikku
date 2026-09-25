import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { added, dim, removed } from '../lib/output.js'
import {
  getOpenApi,
  getPackage,
  OpenApiEntrySchema,
  PackageEntrySchema,
} from '../lib/registry.js'

export const FabricAddonGetInput = z.object({
  name: z.string(),
  apiUrl: z.string().optional(),
})

export const FabricAddonGetOutputSchema = z.object({
  package: PackageEntrySchema.nullable(),
  api: OpenApiEntrySchema.nullable(),
})
export type FabricAddonGetOutput = z.infer<typeof FabricAddonGetOutputSchema>

/**
 * Look one name up in both catalogues before committing to it.
 *
 * Both are consulted because the caller rarely knows which catalogue their
 * name came from, and the two answers mean different things: a published
 * package installs in one step, an OpenAPI entry has to be generated first.
 * Neither being found is itself the useful answer — it means the integration
 * has to be written by hand, and that is worth knowing before starting.
 */
export const FabricAddonGet = pikkuSessionlessFunc({
  description:
    'Look up one registry entry by name, in both the published-addon and OpenAPI catalogues.',
  input: FabricAddonGetInput,
  output: FabricAddonGetOutputSchema,
  func: async (_services, { name, apiUrl: apiUrlOverride }) => {
    const { apiUrl } = await resolveApiContext({ apiUrlOverride })
    const [pkg, api] = await Promise.all([
      getPackage(apiUrl, name).catch(() => null),
      getOpenApi(apiUrl, name).catch(() => null),
    ])
    return { package: pkg, api }
  },
})

export function renderAddonGet(_s: unknown, result: FabricAddonGetOutput): void {
  if (!result.package && !result.api) {
    console.log(
      `\n${removed('Not in the registry.')} ` +
        'No published addon to install and no OpenAPI spec to generate from — ' +
        'this integration has to be written by hand.\n'
    )
    process.exitCode = 1
    return
  }
  if (result.package) {
    const p = result.package
    console.log(`\n${added('Published addon')}`)
    console.log(`  ${p.id ?? p.name}${p.version ? dim(`@${p.version}`) : ''}`)
    if (p.description) console.log(`  ${dim(p.description)}`)
    console.log(dim(`\n  pikku fabric addon add ${p.id ?? p.name}`))
  }
  if (result.api) {
    const a = result.api
    console.log(`\n${dim('OpenAPI spec')}`)
    console.log(`  ${a.name} ${dim(a.title)}`)
    console.log(`  ${dim(a.swaggerUrl)}`)
  }
  console.log('')
}
