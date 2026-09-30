import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { FabricPreconditionError } from '../lib/errors.js'
import { getFabricRPC } from '../lib/http.js'
import { dim, keyValue, safe } from '../lib/output.js'

export const FabricConfigInput = z.object({
  apiUrl: z.string().optional(),
  /** `key=value` project settings to change; an empty value clears the key. */
  assignments: z.array(z.string()).optional(),
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

const ProjectSettings = z.object({
  showcase: z.object({
    name: z.string().nullable(),
    description: z.string().nullable(),
    tags: z.array(z.string()),
    tint: z.string().nullable(),
  }),
  guide: z.object({
    docs: z.string().nullable(),
    theme: z.record(z.string(), z.string()),
  }),
  scenarios: z.object({ env: z.record(z.string(), z.string()) }),
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
  /** The project's Fabric settings, when logged in and linked. */
  settings: ProjectSettings.nullable(),
  /** Why the settings could not be read, when they could not. */
  settingsError: z.string().nullable(),
  /** The keys this call changed. */
  changed: z.array(z.string()),
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
 * `key=value` arguments as the settings patch the API takes. Everything is
 * after the first `=`, so a value may itself contain one; an empty value is
 * `null`, which clears the key.
 */
export const parseAssignments = (
  assignments: readonly string[]
): Record<string, string | null> | null => {
  if (assignments.length === 0) return null
  const set: Record<string, string | null> = {}
  for (const assignment of assignments) {
    const at = assignment.indexOf('=')
    const key = at === -1 ? '' : assignment.slice(0, at).trim()
    if (!key) {
      throw new FabricPreconditionError(
        `"${assignment}" is not a setting — write it as key=value, e.g. showcase.name="My app". An empty value clears the key.`
      )
    }
    const value = assignment.slice(at + 1)
    set[key] = value === '' ? null : value
  }
  return set
}

/**
 * What this checkout resolves to, and where each answer came from, plus the
 * project's Fabric settings. The project link is the git remote and the apps
 * are `frontends` in pikku.config.json; the settings are stored on the project
 * itself, so `key=value` arguments change them there rather than in a file.
 */
export const FabricConfig = pikkuSessionlessFunc({
  description:
    'Show the fabric config this checkout resolves to — project, api url, frontends, settings — or change settings with key=value.',
  input: FabricConfigInput,
  output: FabricConfigOutput,
  func: async (_services, { apiUrl: apiUrlOverride, assignments = [] }) => {
    const set = parseAssignments(assignments)
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

    let settings: FabricConfigResult['settings'] = null
    let settingsError: string | null = null
    if (set) {
      if (!base.token)
        throw new FabricPreconditionError(
          'Not logged in. Run `pikku fabric login` first.'
        )
      if (!project)
        throw new FabricPreconditionError(
          projectError ??
            'No fabric project linked. Run `pikku fabric link` first.'
        )
      const rpc = getFabricRPC({ apiUrl: base.apiUrl, token: base.token })
      settings = (
        await rpc.invoke('setProjectSettings', {
          projectId: project.projectId,
          set,
        })
      ).settings
    } else if (base.token && project) {
      const rpc = getFabricRPC({ apiUrl: base.apiUrl, token: base.token })
      try {
        settings = (
          await rpc.invoke('getProjectSettings', {
            projectId: project.projectId,
          })
        ).settings
      } catch (error) {
        settingsError = error instanceof Error ? error.message : String(error)
      }
    }

    return {
      apiUrl: base.apiUrl,
      apiUrlSource: base.apiUrlSource,
      loggedIn: base.token !== null,
      project,
      projectError,
      frontends: await readFrontends(process.cwd()),
      settings,
      settingsError,
      changed: Object.keys(set ?? {}),
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
  if (config.settings) {
    const entries = settingEntries(config.settings)
    if (entries.length === 0) {
      rows.push([
        'settings',
        dim('(none — set them with `pikku fabric config key=value`)'),
      ])
    }
    for (const [key, value] of entries) rows.push([key, safe(value)])
  } else if (config.settingsError) {
    rows.push(['settings', dim(safe(config.settingsError))])
  }
  if (config.changed.length > 0) {
    console.log(`[fabric] set ${config.changed.join(', ')}.`)
  }
  console.log(keyValue(rows))
}

/** The settings that hold a value, in the dotted form `key=value` takes. */
export const settingEntries = (
  settings: NonNullable<FabricConfigResult['settings']>
): [string, string][] => {
  const { showcase, guide, scenarios } = settings
  const entries: [string, string | null][] = [
    ['showcase.name', showcase.name],
    ['showcase.description', showcase.description],
    ['showcase.tags', showcase.tags.length ? showcase.tags.join(',') : null],
    ['showcase.tint', showcase.tint],
    ['guide.docs', guide.docs],
    ...Object.entries(guide.theme).map(([key, value]): [string, string] => [
      `guide.theme.${key}`,
      value,
    ]),
    ...Object.entries(scenarios.env).map(([name, value]): [string, string] => [
      `scenarios.env.${name}`,
      value,
    ]),
  ]
  return entries.filter((entry): entry is [string, string] => entry[1] !== null)
}
