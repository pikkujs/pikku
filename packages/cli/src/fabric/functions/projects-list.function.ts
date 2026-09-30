import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { matchRemoteProjects } from '../lib/project-link.js'
import { readConfigProjectId } from '../lib/project-id.js'
import { getFabricRPC } from '../lib/http.js'
import { dim } from '../lib/output.js'
import { FabricPreconditionError } from '../lib/errors.js'

export const FabricProjectsListInput = z.object({
  apiUrl: z.string().optional(),
})

export const FabricProjectsListOutput = z.object({
  projects: z.array(
    z.object({
      projectId: z.string(),
      name: z.string(),
      slug: z.string(),
      status: z.string(),
      productionBranch: z.string(),
      gitRepoUrl: z.string().nullable(),
      createdAt: z.string(),
      linked: z.boolean(),
    })
  ),
})

/**
 * The only fabric command that does not need a linked project, which is the
 * point of it: a checkout whose remote matches no project — or two — can run
 * nothing else, and `fabric init` cannot recover the id either — it creates,
 * so against an existing project it fails with a 409 that carries no id.
 */
export const FabricProjectsList = pikkuSessionlessFunc({
  description: 'List the projects in your organization.',
  input: FabricProjectsListInput,
  output: FabricProjectsListOutput,
  func: async (_services, { apiUrl: apiUrlOverride }) => {
    const ctx = await resolveApiContext({
      apiUrlOverride,
      resolveProject: false,
    })
    if (!ctx.token)
      throw new FabricPreconditionError(
        'Not logged in. Run `pikku fabric login` first.'
      )

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const { projects } = await rpc.invoke('fabricCliProjects', {})

    // Every project on the matched remote is marked, not just one: when two
    // share a repo this is the listing that has to show the user both.
    const fromEnv = process.env.FABRIC_PROJECT_ID?.trim()
    const fromConfig = fromEnv ? null : await readConfigProjectId()
    const [match] =
      fromEnv || fromConfig ? [] : await matchRemoteProjects(projects)
    const linkedIds = new Set(
      fromEnv
        ? [fromEnv]
        : fromConfig
          ? [fromConfig.projectId]
          : match
            ? match.matches.map((project) => project.projectId)
            : []
    )

    return {
      projects: projects.map((project) => ({
        ...project,
        linked: linkedIds.has(project.projectId),
      })),
    }
  },
})

type FabricProject = {
  projectId: string
  name: string
  gitRepoUrl: string | null
  linked: boolean
}

export const renderProjectsList = (
  _s: unknown,
  { projects }: { projects: FabricProject[] }
): void => {
  console.log('')
  if (projects.length === 0) {
    console.log(
      dim('  No projects yet. Run `pikku fabric link` to create one.')
    )
    console.log('')
    return
  }

  const width = Math.max(...projects.map((p) => p.name.length))
  for (const project of projects) {
    console.log(
      `  ${project.linked ? '*' : ' '} ${project.name.padEnd(width)}  ${project.projectId}  ${dim(
        project.gitRepoUrl ?? 'no repo'
      )}`
    )
  }
  console.log('')
  if (projects.some((p) => p.linked)) {
    console.log(dim('  * this checkout'))
    console.log('')
  }
}
