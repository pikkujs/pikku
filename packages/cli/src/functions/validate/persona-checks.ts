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

export type PersonaCheckConfig = {
  srcDirectories?: unknown
  outDir?: unknown
  personasMetaJsonFile?: unknown
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
 * A persona declaration is `definePersonas({ … })` written by hand, but the
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
 * Where the persona meta lands when the project has not overridden it, mirroring
 * the default `pikku-cli-config` resolves — validate reads the raw config file
 * rather than the resolved one, so the default has to be repeated here.
 */
const personaMetaPath = (root: string, config: PersonaCheckConfig): string => {
  if (typeof config.personasMetaJsonFile === 'string') {
    return join(root, config.personasMetaJsonFile)
  }
  const outDir = typeof config.outDir === 'string' ? config.outDir : '.pikku'
  return join(root, outDir, 'scopes', 'pikku-personas-meta.gen.json')
}

/**
 * Whether this project declares anyone to run as.
 *
 * Two sources, because either one alone is wrong at a predictable moment: the
 * generated meta is empty on a checkout where codegen has not run yet, and a
 * source scan cannot see personas a dependency contributed. Declared by either
 * counts as declared — a validator that cries about a missing persona on a
 * fresh clone gets muted, and then it never says anything worth hearing.
 */
const countPersonas = async (
  root: string,
  config: PersonaCheckConfig,
  sourceFiles: string[]
): Promise<number> => {
  const metaText = await readTextSafe(personaMetaPath(root, config))
  if (metaText) {
    try {
      const meta = JSON.parse(metaText) as Record<string, unknown>
      const declared = Object.keys(meta).length
      if (declared > 0) return declared
    } catch {
      // A corrupt meta file is the scan's problem to answer, not a reason to
      // claim there are no personas.
    }
  }
  for (const file of sourceFiles) {
    const text = await readTextSafe(file)
    if (text && /\bdefinePersonas\s*\(/.test(text)) return 1
  }
  return 0
}

/**
 * Whether a persona can actually sign in.
 *
 * Two shapes count. `actor()` from `@pikku/better-auth` is the one the scaffold
 * wires, and a hand-rolled `/sign-in/actor` route is the one a project that does
 * not use better-auth ends up with. Both terminate at the same endpoint, so
 * either satisfies the check.
 */
const hasActorSignIn = async (sourceFiles: string[]): Promise<boolean> => {
  for (const file of sourceFiles) {
    const text = await readTextSafe(file)
    if (!text) continue
    const wiresPlugin =
      /@pikku\/better-auth/.test(text) && /\bactor\s*\(/.test(text)
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
 * knowledge: decisions/internals/validate-checks-personas-through-a-shared-module.md
 */
export const runPersonaChecks = async (
  root: string,
  config: PersonaCheckConfig | null
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

  const personas = await countPersonas(root, config ?? {}, sourceFiles)
  const pikkuConfigPath = join(root, 'pikku.config.json')

  if (personas === 0) {
    w(
      'no-personas',
      'No personas are declared — `pikku scenario run` and `pikku persona run` have nobody to run as, so nothing exercises this app the way a user would',
      pikkuConfigPath,
      lines(
        'Declare the people who use this app with definePersonas(), e.g. in',
        'packages/functions/src/scenarios/personas.virtual-user.ts:',
        "  import { definePersonas } from '#pikku/scopes/pikku-personas.gen.js'",
        '  definePersonas({',
        "    founder: { name: 'Anna Müller', jobTitle: 'Managing director' },",
        '  })',
        'Their email addresses are computed from the key and scenarios.emailDomain.'
      )
    )
    return findings
  }

  if (!(await hasActorSignIn(sourceFiles))) {
    w(
      'personas-no-actor-sign-in',
      `${personas} persona${personas === 1 ? ' is' : 's are'} declared, but nothing wires actor sign-in — a scenario run signs in over POST /auth/sign-in/actor, so every persona fails to acquire a session`,
      pikkuConfigPath,
      lines(
        'Wire the actor plugin where better-auth is configured:',
        "  import { actor } from '@pikku/better-auth'",
        '  plugins: [actor({ secret: SCENARIO_ACTOR_SECRET })]',
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
      'personas-no-environments',
      `${personas} persona${personas === 1 ? ' is' : 's are'} declared, but pikku.config.json configures no environments — \`pikku scenario run <environment>\` has no target to resolve and refuses every name`,
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
