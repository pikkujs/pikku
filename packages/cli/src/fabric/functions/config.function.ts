import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { dim, keyValue } from '../lib/output.js'

export const FabricConfigInput = z.object({
  apiUrl: z.string().optional(),
})

const FabricConfigProject = z.object({
  projectId: z.string(),
  source: z.enum(['env', 'config', 'remote']),
  detail: z.string(),
  name: z.string().optional(),
  slug: z.string().optional(),
  productionBranch: z.string().optional(),
  gitRepoUrl: z.string().nullable().optional(),
})

export const FabricConfigOutput = z.object({
  apiUrl: z.string(),
  apiUrlSource: z.enum(['flag', 'env', 'login', 'default']),
  loggedIn: z.boolean(),
  project: FabricConfigProject.nullable(),
  /** Why the project could not be resolved, when it could not. */
  projectError: z.string().nullable(),
  frontends: z.array(
    z.object({ slug: z.string(), cwd: z.string(), kind: z.string().optional() })
  ),
})

type FabricConfigResult = z.infer<typeof FabricConfigOutput>

const findPikkuConfig = (startDir: string): string | null => {
  let dir = startDir
  while (true) {
    const candidate = join(dir, 'pikku.config.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const readFrontends = async (
  cwd: string
): Promise<FabricConfigResult['frontends']> => {
  const path = findPikkuConfig(cwd)
  if (!path) return []
  try {
    const { frontends } = JSON.parse(await readFile(path, 'utf8'))
    if (!frontends || typeof frontends !== 'object') return []
    return Object.entries(frontends as Record<string, unknown>).flatMap(
      ([slug, entry]) => {
        const { cwd, kind } = (entry ?? {}) as { cwd?: unknown; kind?: unknown }
        return typeof cwd === 'string'
          ? [{ slug, cwd, ...(typeof kind === 'string' ? { kind } : {}) }]
          : []
      }
    )
  } catch {
    return []
  }
}

/**
 * What this checkout resolves to, and where each answer came from. Read-only:
 * the project link is the git remote and the apps are `frontends` in
 * pikku.config.json, so there is no local file for this to edit.
 */
export const FabricConfig = pikkuSessionlessFunc({
  description:
    'Show the fabric config this checkout resolves to: project, api url, frontends.',
  input: FabricConfigInput,
  output: FabricConfigOutput,
  func: async (_services, { apiUrl: apiUrlOverride }) => {
    const base = await resolveApiContext({
      apiUrlOverride,
      resolveProject: false,
    })
    let project: FabricConfigResult['project'] = null
    let projectError: string | null = null
    try {
      project = (await resolveApiContext({ apiUrlOverride })).project
    } catch (error) {
      projectError = error instanceof Error ? error.message : String(error)
    }

    return {
      apiUrl: base.apiUrl,
      apiUrlSource: base.apiUrlSource,
      loggedIn: base.token !== null,
      project,
      projectError,
      frontends: await readFrontends(process.cwd()),
    }
  },
})

const PROJECT_SOURCE_LABEL: Record<
  NonNullable<FabricConfigResult['project']>['source'],
  string
> = {
  env: 'env',
  config: 'pikku.config.json',
  remote: 'git remote',
}

export const renderConfig = (_s: unknown, config: FabricConfigResult): void => {
  const { project } = config
  const rows: [string, string][] = [
    ['api', `${config.apiUrl} ${dim(`(${config.apiUrlSource})`)}`],
    ['session', config.loggedIn ? 'logged in' : dim('not logged in')],
  ]
  if (project) {
    rows.push([
      'project',
      `${project.name ?? project.projectId} ${dim(
        `(${PROJECT_SOURCE_LABEL[project.source]}: ${project.detail})`
      )}`,
    ])
    rows.push(['projectId', project.projectId])
    if (project.slug) rows.push(['slug', project.slug])
    if (project.productionBranch)
      rows.push(['production', project.productionBranch])
    if (project.gitRepoUrl) rows.push(['repo', project.gitRepoUrl])
  } else {
    rows.push([
      'project',
      dim(
        config.projectError ??
          (config.loggedIn
            ? 'not linked — run `pikku fabric link`'
            : 'unknown — log in to resolve it from the git remote')
      ),
    ])
  }
  rows.push([
    'frontends',
    config.frontends.length
      ? config.frontends
          .map(
            (f) => `${f.slug} ${dim(`${f.cwd}${f.kind ? ` · ${f.kind}` : ''}`)}`
          )
          .join(', ')
      : dim('(none in pikku.config.json)'),
  ])
  console.log(keyValue(rows))
}
