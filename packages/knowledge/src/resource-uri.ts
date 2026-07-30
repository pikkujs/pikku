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
  // The only prefix that does not resolve to generated code: a persona is
  // declared in `pikku.config.json` (`scenarios.personas`). It still resolves,
  // which is the bar — a note naming a persona nobody declared is exactly the
  // drift this check exists to catch.
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

const readJson = async (path: string): Promise<unknown | null> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch {
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
  const ids: string[] = []
  for (const manifest of manifests) {
    const pkg = (await readJson(manifest)) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    } | null
    const deps = { ...pkg?.dependencies, ...pkg?.devDependencies }
    for (const name of Object.keys(deps)) {
      if (!name.startsWith('@pikku/addon-')) continue
      ids.push(name, name.replace('@pikku/addon-', ''))
    }
  }
  return ids
}

/**
 * Persona names, which is `scenarios.personas` and NOT `scenarios.actors`. A
 * persona is the KIND of person; an actor is one body that signs in as one. A
 * note is about the kind, and the two sets differ the moment a scenario needs two
 * bodies of the same kind.
 */
const personaIds = async (root: string): Promise<string[]> => {
  const config = (await readJson(join(root, 'pikku.config.json'))) as {
    scenarios?: { personas?: Record<string, unknown> }
  } | null
  return Object.keys(config?.scenarios?.personas ?? {})
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
  put('persona', await personaIds(root))

  return known
}
