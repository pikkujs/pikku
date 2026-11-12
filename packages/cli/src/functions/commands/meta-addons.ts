import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import type { MetaRow } from './meta-lines.js'

/**
 * Wired addons' functions for `pikku meta`.
 *
 * The project's own metadata only knows the addon namespace (`slack`), not what the addon offers: the function
 * names, descriptions and input/output schemas live in the installed addon package, in its generated
 * `dist/.pikku/addon` metadata. `pikku meta` reads that so nobody has to open node_modules.
 */

export interface WiredAddon {
  namespace: string
  packageName: string
}

/** The namespaces this project wired with `wireAddon`, and the package behind each. */
export const wiredAddons = (state: any): WiredAddon[] => {
  const declared = state?.rpc?.wireAddonDeclarations
  const entries: Array<[string, any]> =
    declared instanceof Map
      ? [...declared.entries()]
      : Object.entries(declared ?? {})
  return entries
    .map(([namespace, value]) => ({
      namespace,
      packageName: value?.package as string,
    }))
    .filter(
      (addon) => typeof addon.packageName === 'string' && addon.packageName
    )
}

export const installedPackageDir = (
  from: string,
  packageName: string
): string | undefined => {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', packageName)
    if (existsSync(join(candidate, 'package.json'))) return candidate
    if (dirname(dir) === dir) return undefined
  }
}

const readJson = (file: string): any => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

const GENERATED = ['dist/.pikku/addon', '.pikku/addon']

/** The addon package's function metadata, keyed by function id; undefined when it ships none. */
export const readAddonFunctionMeta = (
  packageDir: string
): Record<string, any> | undefined => {
  for (const base of GENERATED) {
    const meta = readJson(
      join(packageDir, base, 'function', 'pikku-functions-meta.gen.json')
    )
    if (meta && typeof meta === 'object') return meta
  }
  return undefined
}

export const readAddonSchema = (packageDir: string, name: string): unknown => {
  for (const base of GENERATED) {
    const schema = readJson(
      join(packageDir, base, 'schemas', 'schemas', `${name}.schema.json`)
    )
    if (schema) return schema
  }
  return undefined
}

/** `chatPostMessage` -> `chat post message`, so a search for "post message" finds it. */
const words = (id: string): string =>
  id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()

const functionsOf = (config: { rootDir: string }, addon: WiredAddon) => {
  const dir = installedPackageDir(config.rootDir, addon.packageName)
  return { dir, meta: dir ? readAddonFunctionMeta(dir) : undefined }
}

/** One search row per function of every wired addon, named `<namespace>:<function>`. */
export const addonFunctionRows = (
  config: { rootDir: string },
  state: any
): MetaRow[] =>
  wiredAddons(state).flatMap((addon) => {
    const { meta } = functionsOf(config, addon)
    return Object.entries(meta ?? {}).map(([id, entry]: [string, any]) => ({
      kind: 'addon function',
      name: `${addon.namespace}:${id}`,
      detail: [words(id), entry?.description].filter(Boolean).join(' — '),
      source: addon.packageName,
    }))
  })

/** What `pikku meta functions` says about the wired addons: where to look, not 400 names. */
export const addonSummary = (config: { rootDir: string }, state: any) =>
  wiredAddons(state).map((addon) => ({
    namespace: addon.namespace,
    package: addon.packageName,
    functions: Object.keys(functionsOf(config, addon).meta ?? {}).length,
  }))

const SHAPE_LIMIT = 60

/** A JSON-schema type in a few words: enums as their values, arrays with their item type. */
const typeOf = (value: any, depth = 0): string => {
  if (!value || typeof value !== 'object') return 'any'
  if (Array.isArray(value.enum)) {
    const values = value.enum.slice(0, 8).map((v: unknown) => JSON.stringify(v))
    return values.join('|') + (value.enum.length > 8 ? '|…' : '')
  }
  if (value.const !== undefined) return JSON.stringify(value.const)
  const type = Array.isArray(value.type) ? value.type.join('|') : value.type
  if (type === 'array')
    return `array<${depth < 1 ? typeOf(value.items, depth + 1) : '…'}>`
  if (type) return type
  if (value.$ref) return 'ref'
  const union = value.anyOf ?? value.oneOf
  if (Array.isArray(union))
    return union
      .slice(0, 4)
      .map((v: any) => typeOf(v, depth + 1))
      .join(' | ')
  return 'any'
}

/** A schema's fields in one short line each: enough to write a call without the raw JSON. */
export const describeSchema = (schema: any): string[] => {
  if (!schema || typeof schema !== 'object') return []
  const required = new Set<string>(
    Array.isArray(schema.required) ? schema.required : []
  )
  const properties = (schema.properties ?? {}) as Record<string, any>
  const lines = Object.entries(properties)
    .slice(0, SHAPE_LIMIT)
    .map(([key, value]) => {
      const note =
        typeof value?.description === 'string'
          ? ` — ${value.description.replace(/\s+/g, ' ').slice(0, 90)}`
          : ''
      return `${key}${required.has(key) ? '' : '?'}: ${typeOf(value)}${note}`
    })
  const more = Object.keys(properties).length - lines.length
  return more > 0 ? [...lines, `… ${more} more fields`] : lines
}

/** `<namespace>:<function>` of a wired addon: its description and its input/output shapes. */
export const addonFunctionDetail = (
  config: { rootDir: string },
  state: any,
  id: string
) => {
  const colon = id.indexOf(':')
  if (colon <= 0) return undefined
  const namespace = id.slice(0, colon)
  const functionId = id.slice(colon + 1)
  const addon = wiredAddons(state).find(
    (candidate) => candidate.namespace === namespace
  )
  if (!addon) return undefined
  const { dir, meta } = functionsOf(config, addon)
  const entry = meta?.[functionId]
  if (!dir || !entry) return undefined
  const inputName = entry.inputSchemaName ?? null
  const outputName = entry.outputSchemaName ?? null
  const input = inputName ? readAddonSchema(dir, inputName) : undefined
  const output = outputName ? readAddonSchema(dir, outputName) : undefined
  return {
    functionId: id,
    addon: { namespace, package: addon.packageName },
    description: entry.description ?? null,
    tags: entry.tags ?? [],
    input: {
      name: inputName,
      fields: describeSchema(input),
      ...(inputName ? {} : { note: 'takes no input: pass {}' }),
    },
    output: {
      name: outputName,
      fields: describeSchema(output),
      ...(outputName && describeSchema(output).length
        ? {}
        : {
            note: 'no response shape is declared: the result is untyped, narrow it in a step of your own',
          }),
    },
    call: `await workflow.do('<step name>', '${id}', { ...input })`,
  }
}

/** The ids an addon offers that start like `typed`, for a "did you mean". */
export const similarAddonFunctions = (
  config: { rootDir: string },
  state: any,
  id: string
): string[] => {
  const colon = id.indexOf(':')
  const namespace = colon > 0 ? id.slice(0, colon) : ''
  const wanted = words(colon > 0 ? id.slice(colon + 1) : id).split(' ')
  const rows = addonFunctionRows(config, state).filter(
    (row) => !namespace || row.name.startsWith(`${namespace}:`)
  )
  return rows
    .map((row) => ({
      name: row.name,
      hits: wanted.filter(
        (word) =>
          word.length > 2 &&
          words(row.name.slice(row.name.indexOf(':') + 1)).includes(word)
      ).length,
    }))
    .filter((row) => row.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5)
    .map((row) => row.name)
}
