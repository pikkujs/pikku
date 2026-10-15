import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { PreconditionError } from '@pikku/cli/addon-support'
import { resolveOrganizationId } from '../lib/organization.js'

export const CloudInitInput = z.object({
  repo: z.string(),
  name: z.string().optional(),
  branch: z.string().optional(),
  force: z.boolean().optional(),
  apiUrl: z.string().optional(),
  organization: z.string().optional(),
})

export const CloudInitOutput = z.object({
  projectId: z.string(),
  projectSlug: z.string(),
})

/**
 * Adopt an existing repo as a cloud project. Calls `importProject` on
 * cloud API which inserts the project + stage rows synchronously. Nothing is
 * written locally: any clone of that repo resolves the project from its git
 * remote, so `pikku cloud deploy / secretsSet / rollback` find it unaided.
 */
export const CloudInit = pikkuSessionlessFunc({
  description:
    'Adopt an existing repo as a cloud project. Clones of it are linked through their git remote.',
  input: CloudInitInput,
  output: CloudInitOutput,
  func: async (
    _services,
    { repo, name, branch, force, apiUrl: apiUrlOverride, organization }
  ) => {
    const ctx = await resolveApiContext({ apiUrlOverride })
    if (!ctx.token)
      throw new PreconditionError(
        'Not logged in. Run `pikku cloud login` first.'
      )

    // A remote link cannot be forced past: a second project on the same repo
    // is exactly the ambiguity every later command refuses to guess through.
    const existing = ctx.project
    if (existing && (existing.source === 'remote' || !force)) {
      throw new PreconditionError(
        `Already linked: ${existing.projectId} (${existing.detail}).${
          existing.source === 'remote' ? '' : ' Pass --force to replace.'
        }`
      )
    }

    const rpc = getCloudRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const organizationId = await resolveOrganizationId(rpc, organization)
    const result = await rpc.invoke('importProject', {
      repoUrl: repo,
      name,
      defaultBranch: branch,
      productionBranch: 'main',
      ...(organizationId ? { organizationId } : {}),
    })

    console.log(`[cloud] imported ${result.projectSlug} (${result.projectId})`)
    console.log(`[cloud] main stage: ${result.mainStageId}`)
    return {
      projectId: result.projectId,
      projectSlug: result.projectSlug,
    }
  },
})
