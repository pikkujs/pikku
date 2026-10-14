import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export type ValidateSeverity = 'error' | 'warn' | 'info'

export type ValidateFinding = {
  id: string
  severity: ValidateSeverity
  message: string
  path: string
  fixHint: string
}

export type VirtualUserCheckConfig = {
  srcDirectories?: unknown
  outDir?: unknown
  virtualUsersMetaJsonFile?: unknown
  environments?: unknown
}

const lines = (...parts: string[]): string => parts.join('\n')

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : []

/**
 * Source files under one directory, flat list, generated files included.
 *
 * A virtual user declaration is `defineVirtualUsers({ … })` written by hand, but the
 * actor plugin is routinely wired in a file the auth scaffold generated, so
 * `.gen.ts` cannot be skipped the way the undeclared-import walk skips it.
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

const readTextSafe = async (path: string): Promise<string | null> => {
  if (!existsSync(path)) return null
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * Where the virtual user meta lands when the project has not overridden it, mirroring
 * the default `pikku-cli-config` resolves — validate reads the raw config file
 * rather than the resolved one, so the default has to be repeated here.
 */
const virtualUserMetaPath = (root: string, config: VirtualUserCheckConfig): string => {
  if (typeof config.virtualUsersMetaJsonFile === 'string') {
    return join(root, config.virtualUsersMetaJsonFile)
  }
  const outDir = typeof config.outDir === 'string' ? config.outDir : '.pikku'
  return join(root, outDir, 'scopes', 'pikku-virtual-users-meta.gen.json')
}

/**
 * Whether this project declares anyone to run as.
 *
 * Two sources, because either one alone is wrong at a predictable moment: the
 * generated meta is empty on a checkout where codegen has not run yet, and a
 * source scan cannot see virtual users a dependency contributed. Declared by either
 * counts as declared — a validator that cries about a missing virtual user on a
 * fresh clone gets muted, and then it never says anything worth hearing.
 */
const countVirtualUsers = async (
  root: string,
  config: VirtualUserCheckConfig,
  sourceFiles: string[]
): Promise<number> => {
  const metaText = await readTextSafe(virtualUserMetaPath(root, config))
  if (metaText) {
    try {
      const meta = JSON.parse(metaText) as Record<string, unknown>
      const declared = Object.keys(meta).length
      if (declared > 0) return declared
    } catch {
      // A corrupt meta file is the scan's problem to answer, not a reason to
      // claim there are no virtual users.
    }
  }
  for (const file of sourceFiles) {
    const text = await readTextSafe(file)
    if (text && /\bdefineVirtualUsers\s*\(/.test(text)) return 1
  }
  return 0
}

/**
 * Whether a virtual user can actually sign in.
 *
 * Two shapes count. `pikkuActor()` from `@pikku/better-auth` is the one the
 * scaffold wires, and a hand-rolled `/sign-in/actor` route is the one a project
 * that does not use better-auth ends up with. Both terminate at the same
 * endpoint, so either satisfies the check. The deprecated `actor()` alias is
 * matched too — an app on an older version wires the same plugin under that
 * name, which was removed from the library.
 */
const hasActorSignIn = async (sourceFiles: string[]): Promise<boolean> => {
  for (const file of sourceFiles) {
    const text = await readTextSafe(file)
    if (!text) continue
    const wiresPlugin =
      /@pikku\/better-auth/.test(text) &&
      /(^|[^\w$.])(pikkuActor|actor)\s*\(/.test(text)
    if (wiresPlugin || /sign-in\/actor/.test(text)) return true
  }
  return false
}

/**
 * The people this project can run as, and whether it can run as them.
 *
 * Shared by `pikku validate` and `pikku fabric validate` — the two
 * validators are separate implementations, and a check that only one of them
 * makes is a check half the projects never see.
 *
 * knowledge: decisions/internals/validate-checks-virtual-users-through-a-shared-module.md
 */
export const runVirtualUserChecks = async (
  root: string,
  config: VirtualUserCheckConfig | null
): Promise<ValidateFinding[]> => {
  const findings: ValidateFinding[] = []
  const w = (
    id: string,
    message: string,
    path: string,
    fixHint: string
  ): void => {
    findings.push({ id, severity: 'warn', message, path, fixHint })
  }

  const srcDirectories = stringArray(config?.srcDirectories)
  const searchDirs = srcDirectories.length
    ? srcDirectories
    : [join('packages', 'functions', 'src')]
  const sourceFiles = (
    await Promise.all(searchDirs.map((dir) => listSourceFiles(join(root, dir))))
  ).flat()

  const virtualUsers = await countVirtualUsers(root, config ?? {}, sourceFiles)
  const pikkuConfigPath = join(root, 'pikku.config.json')

  if (virtualUsers === 0) {
    w(
      'no-virtual-users',
      'No virtual users are declared — `pikku scenario run` and `pikku virtual-user run` have nobody to run as, so nothing exercises this app the way a user would',
      pikkuConfigPath,
      lines(
        'Declare the people who use this app with defineVirtualUsers(), e.g. in',
        'packages/functions/src/scenarios/virtual-users.virtual-user.ts:',
        "  import { defineVirtualUsers } from '#pikku/scopes/pikku-virtual-users.gen.js'",
        '  defineVirtualUsers({',
        "    founder: { name: 'Anna Müller', jobTitle: 'Managing director' },",
        '  })',
        'Their email addresses are computed from the key and scenarios.emailDomain.'
      )
    )
    return findings
  }

  if (!(await hasActorSignIn(sourceFiles))) {
    w(
      'virtual-users-no-actor-sign-in',
      `${virtualUsers} virtualUser${virtualUsers === 1 ? ' is' : 's are'} declared, but nothing wires actor sign-in — a scenario run signs in over POST /auth/sign-in/actor, so every virtual user fails to acquire a session`,
      pikkuConfigPath,
      lines(
        'Wire the actor plugin where better-auth is configured:',
        "  import { pikkuActor } from '@pikku/better-auth'",
        '  plugins: [pikkuActor({ secret: SCENARIO_ACTOR_SECRET })]',
        '`pikku dev` turns the endpoint on and mints the secret itself, so there',
        'is nothing to configure locally. A deployed stage that must run',
        'scenarios opts in with',
        'PIKKU_ALLOW_ACTOR_SIGN_IN=passwordless-actor-sign-in; everywhere else',
        'the endpoint stays off whatever the environment happens to contain.'
      )
    )
  }

  const environments = config?.environments
  const hasEnvironment =
    typeof environments === 'object' &&
    environments !== null &&
    Object.keys(environments).length > 0
  if (!hasEnvironment) {
    w(
      'virtual-users-no-environments',
      `${virtualUsers} virtualUser${virtualUsers === 1 ? ' is' : 's are'} declared, but pikku.config.json configures no environments — \`pikku scenario run <environment>\` has no target to resolve and refuses every name`,
      pikkuConfigPath,
      lines(
        'Add the targets a run may point at:',
        '  "environments": {',
        '    "local": { "apiUrl": "http://localhost:4002", "appUrl": "http://localhost:3000" }',
        '  }'
      )
    )
  }

  return findings
}
