import { pikku } from '../../pikku/http'
import { getServerUrl } from '../../context/serverUrl'

const RENAMED: Record<string, string> = {
  getSandboxThemes: 'getThemes',
  getSandboxThemeSpec: 'getThemeSpec',
  updateSandboxThemeSpec: 'updateThemeSpec',
  updateSandboxJsxProp: 'updateJsxProp',
  getSandboxI18n: 'getI18n',
  writeSandboxI18nLocale: 'writeI18nLocale',
  getSandboxGitStatus: 'getGitStatus',
  commitSandboxChanges: 'commitGitChanges',
  getSandboxGitLog: 'getGitLog',
}

let client: ReturnType<typeof pikku> | null = null

export async function callSandboxControlRpc<T>(
  _baseUrl: string,
  rpcName: string,
  data?: unknown,
  _builderToken?: string | null,
): Promise<T> {
  client ??= pikku({ serverUrl: getServerUrl(), credentials: 'include' })
  const result = await (client.rpc as any).invoke(`console:${RENAMED[rpcName] ?? rpcName}`, data ?? null)
  if (rpcName === 'getSandboxI18n') {
    return { apps: result.apps.map((app: { app: string }) => ({ ...app, slug: app.app })) } as T
  }
  return result as T
}
