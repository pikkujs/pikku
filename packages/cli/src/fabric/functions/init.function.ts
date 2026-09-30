import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { FabricPreconditionError } from '../lib/errors.js'
import { resolveOrganizationId } from '../lib/organization.js'

export const FabricInitInput = z.object({
  repo: z.string(),
  name: z.string().optional(),
  branch: z.string().optional(),
  force: z.boolean().optional(),
  apiUrl: z.string().optional(),
  organization: z.string().optional(),
})

export const FabricInitOutput = z.object({
  projectId: z.string(),
  projectSlug: z.string(),
})

/**
 * Adopt an existing repo as a fabric project. Calls `importProject` on
 * fabric-api which inserts the project + stage rows synchronously. Nothing is
 * written locally: any clone of that repo resolves the project from its git
 * remote, so `pikku fabric deploy / secretsSet / rollback` find it unaided.
 */
export const FabricInit = pikkuSessionlessFunc({
  description:
    'Adopt an existing repo as a fabric project. Clones of it are linked through their git remote.',
  input: FabricInitInput,
  output: FabricInitOutput,
  func: async (
    _services,
    { repo, name, branch, force, apiUrl: apiUrlOverride, organization }
  ) => {
    const ctx = await resolveApiContext({ apiUrlOverride })
    if (!ctx.token)
      throw new FabricPreconditionError(
        'Not logged in. Run `pikku fabric login` first.'
      )

    // A remote link cannot be forced past: a second project on the same repo
    // is exactly the ambiguity every later command refuses to guess through.
    const existing = ctx.project
    if (existing && (existing.source === 'remote' || !force)) {
      throw new FabricPreconditionError(
        `Already linked: ${existing.projectId} (${existing.detail}).${
          existing.source === 'remote' ? '' : ' Pass --force to replace.'
        }`
      )
    }

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const organizationId = await resolveOrganizationId(rpc, organization)
    const result = await rpc.invoke('importProject', {
      repoUrl: repo,
      name,
      defaultBranch: branch,
      productionBranch: 'main',
      ...(organizationId ? { organizationId } : {}),
    })

    console.log(`[fabric] imported ${result.projectSlug} (${result.projectId})`)
    console.log(`[fabric] main stage: ${result.mainStageId}`)
    return {
      projectId: result.projectId,
      projectSlug: result.projectSlug,
    }
  },
})
