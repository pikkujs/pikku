import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The portable half of creating a second frontend.
 *
 * Everything here reads or edits files in the project. Nothing here starts a
 * process, restarts a supervisor or touches a reverse proxy — a host that
 * serves the new app has its own work to do afterwards, and keeping that out
 * is what lets the same logic run on a laptop and in a hosted sandbox.
 */

export const DEFAULT_PORT = 7104

/** What `pikku.config.json`/`pikkufabric.config.json` says about one frontend. */
export interface Frontend {
  cwd: string
  primary?: boolean
  deploy?: boolean
  kind?: string
  dev?: { command: string[]; port: number; healthPath: string }
  serves?: string
  personas?: string[]
  planSlug?: string
}

export interface AppsConfig {
  frontends?: Record<string, Frontend>
  [key: string]: unknown
}

/**
 * Slugs that name a SURFACE rather than the people it is for.
 *
 * `--serves app` says nothing: every frontend is an app. The audience rule
 * below can only do its job when the value is a group of people in their own
 * word, so a surface word is refused rather than quietly accepted.
 */
export const APP_SHAPED = new Set([
  'app',
  'apps',
  'web',
  'website',
  'site',
  'frontend',
  'client',
  'ui',
  'portal',
  'dashboard',
  'console',
  'admin',
])

/** `null` when the slug cannot name a directory, a package and a host. */
export function validateSlug(slug: string): string | null {
  const normalized = slug.trim().toLowerCase()
  if (!/^[a-z][a-z0-9-]{0,38}$/.test(normalized)) return null
  // `api` is the backend's own name on every host that serves both.
  if (normalized === 'api') return null
  return normalized
}

export function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

/**
 * The next free dev port.
 *
 * Every frontend needs its own or the second one fails to bind, and the dev
 * runner then looks like it hung rather than like it collided.
 */
export function nextPort(frontends: Record<string, Frontend>): number {
  const used = Object.values(frontends)
    .map((e) => Number(e.dev?.port))
    .filter((v) => Number.isFinite(v) && v > 0)
  return used.length === 0 ? DEFAULT_PORT : Math.max(...used) + 1
}

/** A refusal to create the app, or `null` when the config permits it. */
export function refuseNewApp(
  slug: string,
  serves: string,
  personas: string[],
  frontends: Record<string, Frontend>,
  personaApps: Map<string, string>
): string | null {
  if (APP_SHAPED.has(serves)) {
    return (
      `--serves ${serves} names a SURFACE, not the people. Say who it is for in ` +
      'their own word — staff, customer, supplier, patient — so the audience is ' +
      'legible to everything that reads it.'
    )
  }

  // The plan's FIRST app is the one the project starts with, and on disk it is
  // keyed `app`. Told only that some other app already serves this audience, a
  // caller reads it as a collision to work around and tries to create the app
  // it is already inside.
  const planned = Object.entries(frontends).find(([, f]) => f.planSlug === slug)
  if (planned) {
    return (
      `"${slug}" is what the plan calls the "${planned[0]}" app, which already ` +
      `exists — apps/${planned[0]} IS your ${slug}. Only the apps AFTER the first ` +
      `get created. Build the ${slug} screens in "${planned[0]}" instead.`
    )
  }

  // The audience rule. Two kinds of user is not a reason to split: a role
  // inside an app changes which nav items and which buttons appear, and
  // nothing else.
  const colleagues = Object.entries(frontends).find(
    ([, f]) => f.serves === serves
  )
  if (colleagues) {
    return (
      `the "${colleagues[0]}" app already serves ${serves}. People sharing an ` +
      'audience share ONE app and differ by nav and permitted actions — add these ' +
      `personas to "${colleagues[0]}" instead. A new app is for a group that app ` +
      'is not for.'
    )
  }

  for (const [otherSlug, other] of Object.entries(frontends)) {
    const taken = personas.filter(
      (p) => personaApps.get(p) === otherSlug || other.personas?.includes(p)
    )
    if (taken.length > 0) {
      return (
        `${taken.join(', ')} already belong to the "${otherSlug}" app. A person ` +
        `signs into one app — move them out of "${otherSlug}" first if they really ` +
        'belong here.'
      )
    }
  }
  return null
}

/** Where one persona's `{ … }` body sits in the source, by declaration id. */
function personaEntries(
  source: string
): { id: string; open: number; close: number }[] {
  const call = /definePersonas\s*\(\s*\{/.exec(source)
  if (!call) return []
  const entries: { id: string; open: number; close: number }[] = []
  let i = call.index + call[0].length
  while (i < source.length) {
    if (source[i] === '}') break
    const match = /^([A-Za-z_$][\w$]*)\s*:\s*\{/.exec(source.slice(i))
    if (!match) {
      i++
      continue
    }
    const open = i + match[0].length
    let depth = 1
    let j = open
    while (j < source.length && depth > 0) {
      if (source[j] === '{') depth++
      else if (source[j] === '}') depth--
      j++
    }
    entries.push({ id: match[1]!, open, close: j - 1 })
    i = j
  }
  return entries
}

export const personasSourcePath = (repoDir: string): string =>
  existsSync(join(repoDir, 'packages', 'functions', 'src', 'personas.ts'))
    ? join(repoDir, 'packages', 'functions', 'src', 'personas.ts')
    : join(repoDir, 'src', 'personas.ts')

/** Which app each declared persona already signs into. */
export function personaAppsInSource(repoDir: string): Map<string, string> {
  const path = personasSourcePath(repoDir)
  const apps = new Map<string, string>()
  if (!existsSync(path)) return apps
  const source = readFileSync(path, 'utf8')
  for (const entry of personaEntries(source)) {
    const app = /(?:^|[\s,{])app\s*:\s*['"`]([^'"`]+)['"`]/.exec(
      source.slice(entry.open, entry.close)
    )
    if (app) apps.set(entry.id, app[1]!)
  }
  return apps
}

/** Every persona id `definePersonas({…})` declares. */
export function personasNamedInSource(repoDir: string): Set<string> {
  const path = personasSourcePath(repoDir)
  if (!existsSync(path)) return new Set()
  return new Set(personaEntries(readFileSync(path, 'utf8')).map((e) => e.id))
}

/**
 * Record on each named persona that they sign into `app`.
 *
 * The declaration is where this belongs: `persona.app` is the field the
 * scenario runner already reads to pick an actor's base url, so keeping a
 * second list beside the app leaves the two able to disagree about where a
 * browser step lands.
 */
export function assignPersonaApp(
  repoDir: string,
  personaIds: string[],
  app: string
): boolean {
  const path = personasSourcePath(repoDir)
  if (!existsSync(path)) return false
  const source = readFileSync(path, 'utf8')
  const wanted = new Set(personaIds)
  const edits = personaEntries(source)
    .filter((entry) => wanted.has(entry.id))
    .reverse()
  if (edits.length === 0) return false
  let next = source
  for (const entry of edits) {
    const body = next.slice(entry.open, entry.close)
    const existing = /(^|[\s,{])app\s*:\s*['"`][^'"`]+['"`],?/.exec(body)
    const replaced = existing
      ? body.slice(0, existing.index) +
        `${existing[1]}app: '${app}',` +
        body.slice(existing.index + existing[0].length)
      : `\n    app: '${app}',${body}`
    next = next.slice(0, entry.open) + replaced + next.slice(entry.close)
  }
  if (next === source) return false
  writeFileSync(path, next)
  return true
}

/**
 * Re-point a cloned app's package.json at its own name, port and build cache.
 *
 * The `--tsBuildInfoFile` path is the one that bites: left alone, two apps
 * fight over one incremental cache and produce type errors that vanish on a
 * clean build.
 */
export function retargetApp(appDir: string, slug: string, port: number): void {
  const path = join(appDir, 'package.json')
  if (!existsSync(path)) return
  const raw = readFileSync(path, 'utf8')
  const pkg = JSON.parse(raw) as {
    name?: string
    scripts?: Record<string, string>
  }
  if (typeof pkg.name === 'string') {
    pkg.name = pkg.name.replace(/[^/]+$/, slug)
  }
  for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
    let next = script.replace(/--port[= ]\d+/g, (m) =>
      m.includes('=') ? `--port=${port}` : `--port ${port}`
    )
    next = next.replace(
      /([\w./-]*)[\w-]+-tsc\.tsbuildinfo/g,
      (_m, prefix: string) => `${prefix}${slug}-tsc.tsbuildinfo`
    )
    pkg.scripts![name] = next
  }
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
}
