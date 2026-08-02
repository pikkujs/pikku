import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * How a knowledge note points at the thing in the code it is about
 * (`resource: func:createEntry`).
 *
 * Every prefix here RESOLVES. A prefix that can't be checked is worse than no
 * prefix: notes accumulate references nothing validates, and the graph rots into
 * fiction exactly where it looks most authoritative. So the scheme is defined by
 * what the generated meta can answer, not by what would be nice to say.
 */
export const RESOURCE_PREFIXES = [
  'func',
  'workflow',
  'schema',
  'http',
  'queue',
  'cron',
  'channel',
  'table',
  'addon',
  // A scope is declared twice over: by the functions that gate themselves with
  // it, which codegen writes into the function meta, and by the roles that
  // confer it in `defineSystemRole()`. Both are declarations, so both resolve.
  'scope',
  // A persona from `definePersonas()`. A note naming a persona nobody declared
  // is exactly the drift this check exists to catch.
  'persona',
] as const

export type ResourcePrefix = (typeof RESOURCE_PREFIXES)[number]

export type ResourceUri = { prefix: ResourcePrefix; id: string }

/** `func:createEntry` → `{ prefix: 'func', id: 'createEntry' }`; null if it isn't one. */
export const parseResourceUri = (uri: string): ResourceUri | null => {
  const at = uri.indexOf(':')
  if (at <= 0) return null
  const prefix = uri.slice(0, at)
  const id = uri.slice(at + 1).trim()
  if (!id) return null
  if (!(RESOURCE_PREFIXES as readonly string[]).includes(prefix)) return null
  return { prefix: prefix as ResourcePrefix, id }
}

/**
 * A meta file, or null when there is nothing usable in it.
 *
 * The two ways to get null are not the same thing. A file that is not there is
 * ordinary — a project with no database has no db schema — so it passes in
 * silence. A file that is there and does not parse is a broken build artifact,
 * and staying silent about it would hide the cause: every note pointing into that
 * meta simply stops being checked, and the run reports nothing wrong.
 */
const readJson = async (path: string): Promise<unknown | null> => {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return null
  }
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    console.warn(
      `knowledge: ignoring ${path} — it is not valid JSON (${(error as Error).message}). Resources of this kind will not be checked.`
    )
    return null
  }
}

const listDir = async (path: string): Promise<string[]> => {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}

/**
 * The wirings meta in `<outDir>/<dir>/`, whatever codegen named it — `http/`
 * holds `pikku-http-wirings-meta.gen.json` while `channel/` holds
 * `pikku-channels-meta.gen.json`.
 *
 * The `contracts` meta sitting in the same directory is deliberately not it: it
 * is keyed by type name, so reading it would hand back ids no note ever means.
 */
const findWireMeta = async (
  outDir: string,
  dir: string
): Promise<unknown | null> => {
  const full = join(outDir, dir)
  const candidates = (await listDir(full))
    .filter(
      (name) =>
        name.endsWith('meta.gen.json') &&
        !name.includes('contracts') &&
        !name.includes('verbose')
    )
    .sort()
  const file =
    candidates.find((name) => name.includes('wirings-meta')) ?? candidates[0]
  return file ? readJson(join(full, file)) : null
}

/**
 * A wire meta is `{ <id>: { name?, pikkuFuncId?, … } }`. A note may name the wire
 * or the function behind it — both are the same thing to whoever wrote the note,
 * so accept either rather than making them learn which one pikku calls the id.
 */
const wireIds = (meta: unknown): string[] => {
  if (!meta || typeof meta !== 'object') return []
  const ids: string[] = []
  for (const [key, value] of Object.entries(meta as Record<string, unknown>)) {
    ids.push(key)
    if (value && typeof value === 'object') {
      const entry = value as { name?: unknown; pikkuFuncId?: unknown }
      if (typeof entry.name === 'string') ids.push(entry.name)
      if (typeof entry.pikkuFuncId === 'string') ids.push(entry.pikkuFuncId)
    }
  }
  return ids
}

/** HTTP meta nests by method: `{ get: { '/route': { pikkuFuncId } } }`. */
const httpIds = (meta: unknown): string[] => {
  if (!meta || typeof meta !== 'object') return []
  const ids: string[] = []
  for (const [method, routes] of Object.entries(
    meta as Record<string, unknown>
  )) {
    if (!routes || typeof routes !== 'object') continue
    for (const [route, entry] of Object.entries(
      routes as Record<string, unknown>
    )) {
      ids.push(route, `${method}:${route}`, `${route}:${method}`)
      const funcId = (entry as { pikkuFuncId?: unknown })?.pikkuFuncId
      if (typeof funcId === 'string') ids.push(funcId)
    }
  }
  return ids
}

/** Table names from the db schema codegen emitted, not from a live connection. */
const tableIds = async (outDir: string): Promise<string[]> => {
  const schema = (await readJson(
    join(outDir, 'db', 'pikku-db-schema.gen.json')
  )) as { tables?: { name?: unknown }[] } | null
  if (!Array.isArray(schema?.tables)) return []
  return schema.tables
    .map((table) => table?.name)
    .filter((name): name is string => typeof name === 'string')
}

/**
 * Addon ids from the manifests that declare the dependency. Both the package
 * name and the bare name resolve — a note saying `addon:stripe` means the same
 * thing as `addon:@pikku/addon-stripe`.
 */
const addonIds = async (root: string): Promise<string[]> => {
  const manifests = [join(root, 'package.json')]
  for (const entry of await listDir(join(root, 'packages'))) {
    manifests.push(join(root, 'packages', entry, 'package.json'))
  }
  // Read together rather than one after another: no manifest tells us anything
  // about where the next one is, so waiting for each in turn only adds up their
  // latencies across a workspace that can hold dozens.
  const packages = (await Promise.all(manifests.map(readJson))) as ({
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  } | null)[]
  const ids: string[] = []
  for (const pkg of packages) {
    const deps = { ...pkg?.dependencies, ...pkg?.devDependencies }
    for (const name of Object.keys(deps)) {
      if (!name.startsWith('@pikku/addon-')) continue
      ids.push(name, name.replace('@pikku/addon-', ''))
    }
  }
  return ids
}

/**
 * Every scope the project declares: the ones functions gate themselves with, and
 * the ones a system role confers.
 *
 * Both sides are needed. A gate is only declared where the function is —
 * `scopes: ['reports:read']` ends up in the function meta — while an umbrella
 * scope like `admin` is often only ever granted through a role and checked by an
 * app's own permission, so it appears nowhere in the function meta. A note about
 * either is about something the project actually declared, which is the bar.
 */
const scopeIds = (functions: unknown, roles: unknown): string[] => {
  const ids: string[] = []
  if (functions && typeof functions === 'object') {
    for (const entry of Object.values(functions as Record<string, unknown>)) {
      const scopes = (entry as { scopes?: unknown })?.scopes
      if (!Array.isArray(scopes)) continue
      for (const scope of scopes) {
        if (typeof scope === 'string') ids.push(scope)
      }
    }
  }
  if (roles && typeof roles === 'object') {
    for (const role of Object.values(roles as Record<string, unknown>)) {
      const scopes = (role as { scopes?: unknown })?.scopes
      if (!Array.isArray(scopes)) continue
      for (const scope of scopes) {
        if (typeof scope === 'string') ids.push(scope)
      }
    }
  }
  return ids
}

/**
 * Every id this project's code currently offers, keyed by prefix — the
 * right-hand side of a `resource:` check.
 *
 * Reads the meta pikku codegen already emitted rather than running the inspector
 * again: this runs right after a codegen that wrote these exact files, and a
 * second pass would be the most expensive check here for information already on
 * disk.
 *
 * A prefix whose meta is missing resolves to an EMPTY set, and the caller treats
 * an empty set as "can't check this prefix" rather than "everything is
 * dangling" — a project with no queues must not fail because a note mentions one.
 */
export const collectKnownResources = async (
  root: string,
  outDir: string
): Promise<Map<ResourcePrefix, Set<string>>> => {
  const known = new Map<ResourcePrefix, Set<string>>()
  const put = (prefix: ResourcePrefix, ids: string[]) => {
    if (ids.length > 0) known.set(prefix, new Set(ids))
  }

  const functions = await readJson(
    join(outDir, 'function', 'pikku-functions-meta.gen.json')
  )
  put(
    'func',
    functions && typeof functions === 'object' ? Object.keys(functions) : []
  )

  put(
    'workflow',
    (await listDir(join(outDir, 'workflow', 'meta')))
      .filter(
        (name) => name.endsWith('.gen.json') && !name.includes('-verbose')
      )
      .map((name) => name.replace(/\.gen\.json$/, ''))
  )

  put(
    'schema',
    (await listDir(join(outDir, 'schemas', 'schemas')))
      .filter((name) => name.endsWith('.schema.json'))
      .map((name) => name.replace(/\.schema\.json$/, ''))
  )

  put('http', httpIds(await findWireMeta(outDir, 'http')))
  put('queue', wireIds(await findWireMeta(outDir, 'queue')))
  put('cron', wireIds(await findWireMeta(outDir, 'scheduler')))
  put('channel', wireIds(await findWireMeta(outDir, 'channel')))
  put('table', await tableIds(outDir))
  put('addon', await addonIds(root))

  // Both come out of codegen rather than pikku.config.json: personas and roles
  // are declared in code, and the meta sidecars are what every other consumer
  // reads them from.
  const roles = await readJson(
    join(outDir, 'scopes', 'pikku-roles-meta.gen.json')
  )
  const personas = await readJson(
    join(outDir, 'scopes', 'pikku-personas-meta.gen.json')
  )
  put('scope', scopeIds(functions, roles))
  put(
    'persona',
    personas && typeof personas === 'object' ? Object.keys(personas) : []
  )

  return known
}
