import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'
import {
  findProjectConfig,
  resolveApiContext,
  writeProjectConfig,
} from '../lib/config.js'
import { getRpc } from '../lib/http.js'

export const FabricInitInput = z.object({
  repo: z.string(),
  name: z.string().optional(),
  branch: z.string().optional(),
  force: z.boolean().optional(),
  apiUrl: z.string().optional(),
})

export const FabricInitOutput = z.object({
  projectId: z.string(),
  projectSlug: z.string(),
  path: z.string(),
})

/**
 * Adopt an existing repo as a fabric project. Calls `importProject` on
 * fabric-api which inserts the project + stage rows synchronously, then
 * writes `fabric.config.json` next to `pikku.config.json` so subsequent
 * `pikku fabric deploy / secretsSet / rollback` commands resolve the link
 * automatically.
 */
export const FabricInit = pikkuSessionlessFunc({
  description:
    'Adopt an existing repo as a fabric project (writes fabric.config.json).',
  input: FabricInitInput,
  output: FabricInitOutput,
  func: async (
    _services,
    { repo, name, branch, force, apiUrl: apiUrlOverride }
  ) => {
    const ctx = await resolveApiContext({ apiUrlOverride })
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')

    const existing = await findProjectConfig()
    if (existing && !force) {
      throw new Error(
        `Already linked: ${existing.config.projectId} at ${existing.path}. Pass --force to replace.`
      )
    }

    const rpc = getRpc({ apiUrl: ctx.apiUrl, token: ctx.token })
    const result = await rpc.invoke('importProject', {
      repoUrl: repo,
      name,
      defaultBranch: branch,
    })

    const path = await writeProjectConfig(process.cwd(), {
      projectId: result.projectSlug,
      ...(apiUrlOverride ? { apiUrl: apiUrlOverride } : {}),
    })
    console.log(
      `[fabric] imported ${result.projectSlug} (${result.projectId}) → ${path}`
    )
    console.log(
      `[fabric] stages: preview=${result.previewStageId} production=${result.productionStageId}`
    )
    return {
      projectId: result.projectSlug,
      projectSlug: result.projectSlug,
      path,
    }
  },
})
