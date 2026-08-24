import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ValidateFinding } from './persona-checks.js'

export type AuthPluginCheckConfig = {
  srcDirectories?: unknown
}

const lines = (...parts: string[]): string => parts.join('\n')

/** Local rather than imported from shared-checks, which imports this module. */
const readTextSafe = async (path: string): Promise<string | null> => {
  if (!existsSync(path)) return null
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : []

/**
 * Source files under one directory, generated files included — better-auth is
 * routinely configured in a file the auth scaffold wrote.
 */
const listSourceFiles = async (dir: string): Promise<string[]> => {
  if (!existsSync(dir)) return []
  try {
    return (await readdir(dir, { recursive: true }))
      .filter(
        (f): f is string =>
          typeof f === 'string' &&
          (f.endsWith('.ts') || f.endsWith('.tsx')) &&
          !f.includes('node_modules')
      )
      .map((f) => join(dir, f))
  } catch {
    return []
  }
}

/**
 * Files importing `admin` out of better-auth's plugin entrypoint.
 *
 * Matched on the import rather than on a bare `admin(` call, which collides
 * with any local helper of that name. The import is also what a project has to
 * remove, so it points at the line that needs editing.
 */
const importsAdminPlugin = (text: string): boolean =>
  /import\s*\{[^}]*\badmin\b[^}]*\}\s*from\s*['"]better-auth\/plugins['"]/.test(
    text
  )

const wiresBanPlugin = (text: string): boolean =>
  /@pikku\/better-auth/.test(text) && /\bban\s*\(/.test(text)

/**
 * Whether better-auth is configured the way pikku supports.
 *
 * Pikku authorizes on scopes, so better-auth's `admin()` — which authorizes its
 * endpoints against a `user.role` column — is unsupported: wiring it means
 * running two authorization models and projecting one onto the other. The
 * inspector refuses it outright at prebuild; this reports the same thing
 * without one, and additionally catches the quieter half of the migration, an
 * app that dropped `admin()` and never wired `ban()`, which keeps its ban
 * columns and its ban UI while silently enforcing nothing.
 */
export const runAuthPluginChecks = async (
  root: string,
  config: AuthPluginCheckConfig | null
): Promise<ValidateFinding[]> => {
  const findings: ValidateFinding[] = []

  const srcDirectories = stringArray(config?.srcDirectories)
  const searchDirs = srcDirectories.length
    ? srcDirectories
    : [join('packages', 'functions', 'src')]
  const sourceFiles = (
    await Promise.all(searchDirs.map((dir) => listSourceFiles(join(root, dir))))
  ).flat()

  let bansAnywhere = false
  const adminFiles: string[] = []
  for (const file of sourceFiles) {
    const text = await readTextSafe(file)
    if (!text) continue
    if (importsAdminPlugin(text)) adminFiles.push(file)
    if (wiresBanPlugin(text)) bansAnywhere = true
  }

  for (const file of adminFiles) {
    findings.push({
      id: 'better-auth-admin-plugin',
      severity: 'error',
      message:
        "better-auth's admin() plugin is not supported — it authorizes against a user.role column while pikku authorizes on scopes, so one has to be projected onto the other",
      path: file,
      fixHint: lines(
        'Replace it with ban(), which keeps the one capability admin() had that',
        'pikku cannot supply from outside better-auth — refusing a banned user a',
        'session:',
        "  import { ban } from '@pikku/better-auth'",
        '  betterAuth({ plugins: [ban()] })',
        'User management is already scoped RPCs in @pikku/addon-admin: list,',
        'create, ban, remove, revoke sessions and set password.'
      ),
    })
  }

  if (!bansAnywhere && adminFiles.length === 0) {
    const configuresAuth = sourceFiles.length > 0
    if (configuresAuth) {
      for (const file of sourceFiles) {
        const text = await readTextSafe(file)
        if (!text || !/\bpikkuBetterAuth\s*\(/.test(text)) continue
        findings.push({
          id: 'better-auth-no-ban-plugin',
          severity: 'warn',
          message:
            'better-auth is configured without ban() — the banned/banReason/banExpires columns do not exist, so banning a user through @pikku/addon-admin has nothing to write and nothing refuses their next sign-in',
          path: file,
          fixHint: lines(
            "  import { ban } from '@pikku/better-auth'",
            '  betterAuth({ plugins: [ban()] })',
            'Wire it wherever the rest of your plugins are, then run',
            '`pikku db migrate` to add the columns.'
          ),
        })
        break
      }
    }
  }

  return findings
}
