import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { getFabricRPC } from './http.js'
import {
  resolveLinkedProject,
  type LinkedProject,
  type ProjectSource,
} from './project-link.js'

export const DEFAULT_API_URL = 'https://api.pikkufabric.com'

/**
 * `pikkufabric.config.json` — legacy, read only. It used to pin the project
 * link, which meant `link` had to commit and push it before the first deploy.
 * The link is now the git remote (see `project-link.ts`) and the apps are
 * `frontends` in `pikku.config.json`, so nothing writes this file any more; a
 * repo that still has one is honoured as the last fallback. Discovered by
 * walking up from cwd until found.
 */
export interface ProjectConfig {
  projectId: string
  apiUrl?: string
  production?: FabricProductionConfig
}

/**
 * Production custom domain config. Production always maps to `main`; if
 * `domain` is set, fabric expects users to CNAME `<slug>.<domain>` and
 * `api.<domain>` at the matching `*.pikkufabric.app` hostnames. If absent,
 * production lives only on the platform-managed `*.pikkufabric.app`
 * hostnames.
 */
export interface FabricProductionConfig {
  domain?: string
}

/**
 * `~/.fabric/auth.json` keys auth tokens by api-url so a single user can
 * stay logged into prod + local dev side-by-side.
 */
export interface AuthFile {
  tokens: Record<string, string>
  /**
   * The api-url of the last `login`. With no project file to pin it, this is
   * what keeps a login against a local or staging fabric the default for the
   * commands that follow it.
   */
  defaultApiUrl?: string
}

export const projectConfigName = 'pikkufabric.config.json'
const authFilePath = join(homedir(), '.fabric', 'auth.json')

export async function findProjectConfig(
  startDir = process.cwd()
): Promise<{ path: string; config: ProjectConfig } | null> {
  let dir = startDir
  while (true) {
    const candidate = join(dir, projectConfigName)
    if (existsSync(candidate)) {
      const raw = await readFile(candidate, 'utf8')
      return { path: candidate, config: JSON.parse(raw) as ProjectConfig }
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Templates ship `pikkufabric.config.json` with a `__PROJECT_ID__` placeholder
 * so the file's shape is visible before the repo is linked. A placeholder is
 * not a link: without this, `fabric init` on a fresh scaffold reports
 * "Already linked: __PROJECT_ID__" and every other command sends the
 * placeholder to the API as if it were a real id.
 */
export function isLinkedProjectId(projectId?: string | null): boolean {
  if (!projectId) return false
  return !/^__.*__$/.test(projectId)
}

export async function readAuthFile(): Promise<AuthFile> {
  if (!existsSync(authFilePath)) return { tokens: {} }
  const raw = await readFile(authFilePath, 'utf8')
  return JSON.parse(raw) as AuthFile
}

export async function writeAuthFile(file: AuthFile): Promise<void> {
  await mkdir(dirname(authFilePath), { recursive: true })
  await writeFile(authFilePath, JSON.stringify(file, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  })
}

export type ApiUrlSource = 'flag' | 'config-file' | 'env' | 'login' | 'default'

export interface ResolvedApiContext {
  apiUrl: string
  apiUrlSource: ApiUrlSource
  token: string | null
  projectId: string | null
  /** How `projectId` was found; null when it was not looked up or not found. */
  project: LinkedProject | null
}

export type { LinkedProject, ProjectSource }

/**
 * Stitch together the api-url, auth token and linked project.
 *
 * api-url, first that answers:
 *   1. explicit override (e.g. --api-url flag)
 *   2. a legacy pikkufabric.config.json apiUrl
 *   3. FABRIC_API_URL env var
 *   4. the api-url of the last `login`
 *   5. hardcoded default
 *
 * Token comes from ~/.fabric/auth.json keyed by the resolved api-url. The
 * project is resolved by `resolveLinkedProject` — env, git remote, then the
 * legacy file — and only when there is a token to ask fabric with.
 * `resolveProject: false` skips it for commands that never use it.
 */
export async function resolveApiContext(
  opts: {
    apiUrlOverride?: string
    startDir?: string
    resolveProject?: boolean
  } = {}
): Promise<ResolvedApiContext> {
  const projectFile = await findProjectConfig(opts.startDir)
  const auth = await readAuthFile()
  const [apiUrl, apiUrlSource]: [string, ApiUrlSource] = opts.apiUrlOverride
    ? [opts.apiUrlOverride, 'flag']
    : projectFile?.config.apiUrl
      ? [projectFile.config.apiUrl, 'config-file']
      : process.env.FABRIC_API_URL
        ? [process.env.FABRIC_API_URL, 'env']
        : auth.defaultApiUrl
          ? [auth.defaultApiUrl, 'login']
          : [DEFAULT_API_URL, 'default']
  const token = auth.tokens[apiUrl] ?? null

  const legacy =
    projectFile && isLinkedProjectId(projectFile.config.projectId)
      ? { projectId: projectFile.config.projectId, path: projectFile.path }
      : null
  const project =
    opts.resolveProject === false
      ? null
      : await resolveLinkedProject({
          rpc: token ? getFabricRPC({ apiUrl, token }) : null,
          cwd: opts.startDir,
          legacy,
        })

  return {
    apiUrl,
    apiUrlSource,
    token,
    projectId: project?.projectId ?? null,
    project,
  }
}
