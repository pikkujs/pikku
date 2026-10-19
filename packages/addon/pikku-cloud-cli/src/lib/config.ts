import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { getCloudRPC } from './http.js'
import { CloudPreconditionError } from '@pikku/cli/addon-support'
import {
  resolveLinkedProject,
  type LinkedProject,
  type ProjectSource,
} from './project-link.js'

export const DEFAULT_API_URL = 'https://api.pikkustudio.app'

/**
 * `~/.pikkustudio/auth.json` keys auth tokens by api-url so a single user can
 * stay logged into prod + local dev side-by-side.
 */
export interface AuthFile {
  tokens: Record<string, string>
  /**
   * The api-url of the last `login`. This is what keeps a login against a
   * local or staging cloud the default for the commands that follow it.
   */
  defaultApiUrl?: string
}

// HOME first: bun's homedir() ignores a HOME changed at runtime, so tests that
// point HOME at a temp dir would otherwise overwrite the real login.
const authFilePath = () =>
  join(process.env.HOME || homedir(), '.pikkustudio', 'auth.json')

export async function readAuthFile(): Promise<AuthFile> {
  if (!existsSync(authFilePath())) return { tokens: {} }
  const raw = await readFile(authFilePath(), 'utf8')
  return JSON.parse(raw) as AuthFile
}

export async function writeAuthFile(file: AuthFile): Promise<void> {
  await mkdir(dirname(authFilePath()), { recursive: true })
  await writeFile(authFilePath(), JSON.stringify(file, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  })
}

export type ApiUrlSource = 'flag' | 'env' | 'login' | 'default'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

const SOURCE_LABEL: Record<ApiUrlSource, string> = {
  flag: 'the --api-url flag',
  env: 'PIKKUSTUDIO_API_URL',
  login: 'your last login',
  default: 'the default',
}

/**
 * The bearer token goes to whatever URL resolves, so a plain-http one sends it
 * in cleartext. Loopback is exempt: that is local dev, and nothing leaves the
 * machine.
 */
export function assertSecureApiUrl(apiUrl: string, source: ApiUrlSource): void {
  let url: URL
  try {
    url = new URL(apiUrl)
  } catch {
    throw new CloudPreconditionError(
      `Invalid cloud api url "${apiUrl}" (from ${SOURCE_LABEL[source]})`
    )
  }
  if (url.protocol === 'https:') return
  if (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)) return
  throw new CloudPreconditionError(
    `Refusing to use cloud api url "${apiUrl}" (from ${SOURCE_LABEL[source]}): ` +
      `it would send your token unencrypted. Use https, or http only for localhost.`
  )
}

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
 *   2. PIKKUSTUDIO_API_URL env var
 *   3. the api-url of the last `login`
 *   4. hardcoded default
 *
 * Token comes from the PIKKUSTUDIO_API_KEY env var (a sandbox or CI holds no file),
 * else ~/.pikkustudio/auth.json keyed by the resolved api-url. The
 * project is resolved by `resolveLinkedProject` — env, then the git
 * remote — and only when there is a token to ask cloud with.
 * `resolveProject: false` skips it for commands that never use it.
 */
export async function resolveApiContext(
  opts: {
    apiUrlOverride?: string
    startDir?: string
    resolveProject?: boolean
  } = {}
): Promise<ResolvedApiContext> {
  const auth = await readAuthFile()
  const [apiUrl, apiUrlSource]: [string, ApiUrlSource] = opts.apiUrlOverride
    ? [opts.apiUrlOverride, 'flag']
    : process.env.PIKKUSTUDIO_API_URL
      ? [process.env.PIKKUSTUDIO_API_URL, 'env']
      : auth.defaultApiUrl
        ? [auth.defaultApiUrl, 'login']
        : [DEFAULT_API_URL, 'default']
  assertSecureApiUrl(apiUrl, apiUrlSource)
  const token =
    process.env.PIKKUSTUDIO_API_KEY?.trim() || auth.tokens[apiUrl] || null

  const project =
    opts.resolveProject === false
      ? null
      : await resolveLinkedProject({
          rpc: token ? getCloudRPC({ apiUrl, token }) : null,
          cwd: opts.startDir,
        })

  return {
    apiUrl,
    apiUrlSource,
    token,
    projectId: project?.projectId ?? null,
    project,
  }
}
