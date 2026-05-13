import { z } from 'zod'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import {
  findProjectConfig,
  resolveApiContext,
  writeProjectConfig,
} from '../lib/config.js'
import { getRpc } from '../lib/http.js'

export const FabricLinkInput = z.object({
  project: z.string().optional(),
  force: z.boolean().optional(),
  apiUrl: z.string().optional(),
})

export const FabricLinkOutput = z.object({
  projectId: z.string(),
  path: z.string(),
})

interface ListProjectsResponse {
  projects: Array<{
    id: string
    slug: string
    name: string
    status: string
  }>
}

export const FabricLink = pikkuSessionlessFunc({
  description:
    'Link the current directory to a fabric project (writes fabric.config.json).',
  input: FabricLinkInput,
  output: FabricLinkOutput,
  func: async (_services, { project, force, apiUrl: apiUrlOverride }) => {
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
    const { projects } = await rpc.invoke('listProjects', {})
    if (projects.length === 0) {
      throw new Error('No projects found on this fabric instance.')
    }

    let chosen: ListProjectsResponse['projects'][number] | undefined
    if (project) {
      chosen = projects.find(
        (p) => p.id === project || p.slug === project || p.name === project
      )
      if (!chosen) {
        throw new Error(
          `No project matches "${project}". Available: ${projects.map((p) => p.slug).join(', ')}`
        )
      }
    } else if (projects.length === 1) {
      chosen = projects[0]
    } else {
      console.log('[fabric] available projects:')
      projects.forEach((p, i) =>
        console.log(`  ${i + 1}. ${p.slug}  (${p.name}) [${p.status}]`)
      )
      const rl = createInterface({ input: stdin, output: stdout })
      const answer = (await rl.question('Pick one (number or slug): ')).trim()
      rl.close()
      const idx = Number.parseInt(answer, 10)
      if (!Number.isNaN(idx) && idx >= 1 && idx <= projects.length) {
        chosen = projects[idx - 1]
      } else {
        chosen = projects.find((p) => p.slug === answer || p.name === answer)
      }
      if (!chosen) throw new Error(`No selection matched "${answer}".`)
    }

    // Only persist apiUrl when the user overrode it — keeps fabric.config.json
    // minimal in the common case (auth + default URL chain handle the rest).
    const path = await writeProjectConfig(process.cwd(), {
      projectId: chosen!.slug,
      ...(apiUrlOverride ? { apiUrl: apiUrlOverride } : {}),
    })
    console.log(`[fabric] linked ${chosen!.slug} at ${path}`)
    return { projectId: chosen!.slug, path }
  },
})
