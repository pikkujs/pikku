import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const DEFAULT_API_URL = 'https://api.pikkufabric.com'

/**
 * `pikkufabric.config.json` lives next to `pikku.config.json` in the project
 * root. Pins the project link (id, default api url) and declares deployable
 * apps + production domain. Discovered by walking up from cwd until found.
 */
export interface ProjectConfig {
  projectId: string
  apiUrl?: string
  frontends?: Record<string, FabricAppConfig>
  production?: FabricProductionConfig
}

/** One entry per deployable frontend in the repo. Key is a short slug. */
export interface FabricAppConfig {
  cwd: string
  primary?: boolean
  deploy?: boolean
  kind?: 'spa' | 'ssr' | 'static'
  dev?: { command?: string[]; port?: number; healthPath?: string }
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
}

const projectConfigName = 'pikkufabric.config.json'
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

export async function writeProjectConfig(
  cwd: string,
  config: ProjectConfig
): Promise<string> {
  const path = join(cwd, projectConfigName)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(config, null, 2) + '\n', 'utf8')
  return path
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

export interface ResolvedApiContext {
  apiUrl: string
  token: string | null
  projectId: string | null
}

/**
 * Stitch together the api-url + auth token from the standard sources:
 *   1. explicit override (e.g. --api-url flag)
 *   2. pikkufabric.config.json apiUrl
 *   3. FABRIC_API_URL env var
 *   4. hardcoded default
 *
 * Token comes from ~/.fabric/auth.json keyed by the resolved api-url.
 */
export async function resolveApiContext(
  opts: { apiUrlOverride?: string } = {}
): Promise<ResolvedApiContext> {
  const projectFile = await findProjectConfig()
  const apiUrl =
    opts.apiUrlOverride ??
    projectFile?.config.apiUrl ??
    process.env.FABRIC_API_URL ??
    DEFAULT_API_URL
  const auth = await readAuthFile()
  return {
    apiUrl,
    token: auth.tokens[apiUrl] ?? null,
    projectId: isLinkedProjectId(projectFile?.config.projectId)
      ? projectFile!.config.projectId
      : null,
  }
}
