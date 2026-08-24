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
 * The text inside every `plugins: [...]` array in the file.
 *
 * Bracket-counted rather than parsed: `pikku validate` runs without a TypeScript
 * program, and a `]` inside a string literal in a plugin's options is the only
 * way this misreads an array — at which point the check under-reports rather
 * than inventing a finding.
 */
const pluginArrays = (text: string): string[] => {
  const arrays: string[] = []
  const opener = /plugins\s*:\s*\[/g
  let match: RegExpExecArray | null
  while ((match = opener.exec(text))) {
    const start = match.index + match[0].length
    let depth = 1
    let i = start
    while (i < text.length && depth > 0) {
      if (text[i] === '[') depth++
      else if (text[i] === ']') depth--
      i++
    }
    if (depth === 0) arrays.push(text.slice(start, i - 1))
  }
  return arrays
}

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * How `exported` from `module` can be called in this file: the local name a
 * named import bound it to, or `<namespace>.<exported>` for a namespace import.
 * Empty when the file never imports it, so a local helper of the same name is
 * not mistaken for the package's.
 */
const importedCallees = (
  text: string,
  module: string,
  exported: string
): string[] => {
  const callees: string[] = []
  const imports = /import\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = imports.exec(text))) {
    if (match[2] !== module) continue
    const clause = match[1]!
    const namespace = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)
    if (namespace) {
      callees.push(`${namespace[1]}.${exported}`)
      continue
    }
    const named = clause.match(/\{([\s\S]*?)\}/)
    if (!named) continue
    for (const entry of named[1]!.split(',')) {
      const [imported, alias] = entry.split(/\s+as\s+/).map((v) => v.trim())
      if (imported === exported) callees.push(alias || imported)
    }
  }
  return callees
}

/**
 * Whether `exported` from `module` is wired as a plugin — imported from that
 * package *and* called inside a `plugins: [...]` array. An import left behind
 * after the call was removed configures nothing, and a call somewhere else in
 * the file is not a plugin.
 */
const configuresPlugin = (
  text: string,
  module: string,
  exported: string
): boolean => {
  const callees = importedCallees(text, module, exported)
  if (callees.length === 0) return false
  return pluginArrays(text).some((array) =>
    callees.some((callee) =>
      new RegExp(`(^|[^\\w$.])${escapeRegExp(callee)}\\s*\\(`).test(array)
    )
  )
}

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
    if (configuresPlugin(text, 'better-auth/plugins', 'admin'))
      adminFiles.push(file)
    if (configuresPlugin(text, '@pikku/better-auth', 'ban')) bansAnywhere = true
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
