import { git } from '@pikku/cli/addon-support'

export const GIT_HELPER_COMMAND = '!pikku cloud auth git'

/**
 * The git server that belongs to an api: `PIKKUSTUDIO_GIT_HOST` when set,
 * otherwise the api host with its `api.` label swapped for `git.`
 * (api.pikkustudio.app → git.pikkustudio.app). An api with no `api.` label —
 * a local dev cloud — has no git host to register.
 */
export function cloudGitHost(
  apiUrl: string,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const explicit = env.PIKKUSTUDIO_GIT_HOST?.trim().toLowerCase()
  if (explicit) return explicit
  let host: string
  try {
    host = new URL(apiUrl).host.toLowerCase()
  } catch {
    return null
  }
  return host.startsWith('api.') ? `git.${host.slice(4)}` : null
}

/** git's credential-helper protocol: `key=value` lines, ended by a blank line or EOF. */
export function parseCredentialRequest(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    if (line === '') break
    const eq = line.indexOf('=')
    if (eq > 0) out[line.slice(0, eq)] = line.slice(eq + 1)
  }
  return out
}

export type GitCredentialInvoke = (input: {
  protocol?: string
  host: string
  path: string
}) => Promise<{ username: string; password: string }>

/**
 * What the helper prints for one request. Only `get`, only over https, and
 * only for the cloud git host is answered; every other request gets nothing,
 * which tells git to ask its next helper.
 */
export async function answerCredentialRequest(opts: {
  operation: string
  request: Record<string, string>
  gitHost: string | null
  invoke: GitCredentialInvoke
}): Promise<string> {
  const { operation, request, gitHost, invoke } = opts
  if (operation !== 'get' || !gitHost) return ''
  if (request.protocol !== 'https') return ''
  if (request.host?.toLowerCase() !== gitHost) return ''
  const credential = await invoke({
    protocol: request.protocol,
    host: request.host,
    path: request.path ?? '',
  })
  return `username=${credential.username}\npassword=${credential.password}\n`
}

const helperKey = (host: string) => `credential.https://${host}.helper`
const httpPathKey = (host: string) => `credential.https://${host}.useHttpPath`

async function configValues(key: string): Promise<string[]> {
  try {
    const out = await git(['config', '--global', '--get-all', key])
    return out.split('\n')
  } catch {
    return []
  }
}

/**
 * Registers the helper for `host` only. It adds one helper line scoped to that
 * host, never the global helper list, and asks git to send the repo path,
 * which the cloud needs to know which project's credential to mint.
 * Running it again changes nothing.
 */
export async function registerGitHelper(host: string): Promise<void> {
  if (!(await configValues(helperKey(host))).includes(GIT_HELPER_COMMAND)) {
    await git([
      'config',
      '--global',
      '--add',
      helperKey(host),
      GIT_HELPER_COMMAND,
    ])
  }
  await git(['config', '--global', httpPathKey(host), 'true'])
}

/** Removes exactly what `registerGitHelper` added; a helper the user set themselves stays. */
export async function unregisterGitHelper(host: string): Promise<void> {
  if ((await configValues(helperKey(host))).includes(GIT_HELPER_COMMAND)) {
    const pattern = `^${GIT_HELPER_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
    await git(['config', '--global', '--unset-all', helperKey(host), pattern])
    await git(['config', '--global', '--unset-all', httpPathKey(host)]).catch(
      () => undefined
    )
  }
}
