import { getRemoteUrl, git, isGitRepo } from '../../utils/git.js'
import { readConfigProjectId, writeConfigProjectId } from './project-id.js'
import { FabricPreconditionError } from './errors.js'
import type { getFabricRPC } from './http.js'

/**
 * Where the linked project came from, in the order they are tried.
 *
 * The git remote is the link: fabric already records every project's repo, so
 * a checkout names its project by being a clone of that repo, and a teammate's
 * fresh clone is linked without running anything. Nothing is written to the
 * repository, so linking never dirties the tree or needs a commit.
 */
export type ProjectSource = 'env' | 'config' | 'remote'

export interface LinkedProject {
  projectId: string
  source: ProjectSource
  /** The remote name and url, the env var, or the config file path. */
  detail: string
  name?: string
  slug?: string
  productionBranch?: string
  gitRepoUrl?: string | null
}

export interface FabricProjectRow {
  projectId: string
  name: string
  slug: string
  productionBranch: string
  gitRepoUrl: string | null
}

/**
 * One comparable form for every way a remote can be spelt: ssh or https, with
 * or without credentials, a `.git` suffix or a trailing slash. Hosts and paths
 * are compared case-insensitively, as GitHub and Gitea both treat them.
 */
export const normalizeRepoUrl = (raw: string): string | null => {
  const url = raw.trim()
  if (!url) return null
  const scp = url.match(/^[^@/]+@([^:/]+):(.+)$/)
  let host: string
  let path: string
  if (scp) {
    host = scp[1]!
    path = scp[2]!
  } else {
    try {
      const parsed = new URL(url)
      host = parsed.host
      path = parsed.pathname
    } catch {
      return null
    }
  }
  path = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '')
  if (!host || !path) return null
  return `${host}/${path}`.toLowerCase()
}

/** `origin` first, then the rest in git's order. */
export const listRemotes = async (cwd?: string): Promise<string[]> => {
  if (!(await isGitRepo(cwd))) return []
  const out = await git(['remote'], cwd).catch(() => '')
  const names = out
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean)
  return [
    ...names.filter((name) => name === 'origin'),
    ...names.filter((name) => name !== 'origin'),
  ]
}

/**
 * The fabric projects whose repo is one of this checkout's remotes, from the
 * first remote that matches any. Returns the remote alongside so the caller
 * can say where the link came from.
 */
export const matchRemoteProjects = async (
  projects: FabricProjectRow[],
  cwd?: string
): Promise<{ remote: string; url: string; matches: FabricProjectRow[] }[]> => {
  const byRepo = new Map<string, FabricProjectRow[]>()
  for (const project of projects) {
    const key = project.gitRepoUrl && normalizeRepoUrl(project.gitRepoUrl)
    if (!key) continue
    byRepo.set(key, [...(byRepo.get(key) ?? []), project])
  }
  const found: { remote: string; url: string; matches: FabricProjectRow[] }[] =
    []
  for (const remote of await listRemotes(cwd)) {
    const url = await getRemoteUrl(remote, cwd).catch(() => null)
    const key = url && normalizeRepoUrl(url)
    const matches = key ? byRepo.get(key) : undefined
    if (url && matches?.length) found.push({ remote, url, matches })
  }
  return found
}

/**
 * The project this checkout is linked to, or null when nothing links it.
 *
 *   1. `FABRIC_PROJECT_ID` — CI, scripts, and anyone overriding the remote.
 *   2. `fabric.projectId` in pikku.config.json.
 *   3. A git remote whose repo is a fabric project in the session's org; the
 *      id is then written into pikku.config.json (uncommitted), so the lookup
 *      happens once.
 *
 * Two projects on one repo is refused rather than guessed between.
 */
export const resolveLinkedProject = async ({
  rpc,
  cwd,
}: {
  rpc: ReturnType<typeof getFabricRPC> | null
  cwd?: string
}): Promise<LinkedProject | null> => {
  const fromEnv = process.env.FABRIC_PROJECT_ID?.trim()
  if (fromEnv) {
    return { projectId: fromEnv, source: 'env', detail: 'FABRIC_PROJECT_ID' }
  }

  const fromConfig = await readConfigProjectId(cwd)
  if (fromConfig) {
    return {
      projectId: fromConfig.projectId,
      source: 'config',
      detail: fromConfig.path,
    }
  }

  if (rpc && (await listRemotes(cwd)).length > 0) {
    const { projects } = await rpc.invoke('fabricCliProjects', {})
    {
      const [first] = await matchRemoteProjects(projects, cwd)
      if (first) {
        if (first.matches.length > 1) {
          throw new FabricPreconditionError(
            [
              `${first.remote} (${first.url}) is the repo of ${first.matches.length} fabric projects:`,
              ...first.matches.map((p) => `  ${p.name}  ${p.projectId}`),
              'Pick one with FABRIC_PROJECT_ID=<projectId>.',
            ].join('\n')
          )
        }
        const project = first.matches[0]!
        await writeConfigProjectId(project.projectId, cwd)
        return {
          projectId: project.projectId,
          source: 'remote',
          detail: `${first.remote} → ${first.url}`,
          name: project.name,
          slug: project.slug,
          productionBranch: project.productionBranch,
          gitRepoUrl: project.gitRepoUrl,
        }
      }
    }
  }

  return null
}
