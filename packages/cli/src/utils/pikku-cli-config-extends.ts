import { dirname, isAbsolute, relative, resolve } from 'path'
import { readFile } from 'fs/promises'
import type { PikkuCLIInput } from '../../types/config.js'
import { PikkuCLIConfigError } from './pikku-cli-config-error.js'

type ConfigLayer = Record<string, unknown>

/**
 * Array fields that a child config adds to rather than replaces. Each is a list
 * of paths, so concatenating is unambiguous and a duplicate is detectable by
 * comparing resolved paths. Every other array — `ignoreFiles`, `blocks`,
 * `filters.tags`, `dev.command`, extension lists — is a value the child states
 * in full, and the child's copy replaces the parent's.
 */
export const EXTENDS_CONCAT_PATH_LISTS = ['srcDirectories'] as const

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isPathKey = (key: string) =>
  key.endsWith('File') || key.endsWith('Directory') || key.endsWith('Dir')

/**
 * Makes every path a config layer declares absolute, against the file that
 * declared it, so layers from different directories can be merged without a
 * path changing meaning on the way. The bases are the ones the loader already
 * uses for a single file: `outDir`, `clientFiles` and `frontends.*.cwd` against
 * the config's directory; `srcDirectories`, `tsconfig`, `scaffold` paths and
 * top-level `*File`/`*Dir`/`*Directory` against the layer's `rootDir`.
 */
export const resolveLayerPaths = (
  raw: ConfigLayer,
  configDir: string,
  isBase: boolean
): ConfigLayer => {
  const layer: ConfigLayer = structuredClone(raw)
  delete layer.extends

  const layerRoot =
    typeof raw.rootDir === 'string'
      ? resolve(configDir, raw.rootDir)
      : configDir
  if (typeof raw.rootDir === 'string' || isBase) {
    layer.rootDir = layerRoot
  }

  if (Array.isArray(layer.srcDirectories)) {
    layer.srcDirectories = layer.srcDirectories.map((dir) =>
      typeof dir === 'string' ? resolve(layerRoot, dir) : dir
    )
  }
  if (typeof layer.outDir === 'string') {
    layer.outDir = resolve(configDir, layer.outDir)
  }
  if (typeof layer.tsconfig === 'string') {
    layer.tsconfig = resolve(layerRoot, layer.tsconfig)
  }
  for (const [key, value] of Object.entries(layer)) {
    if (key !== 'rootDir' && key !== 'outDir' && isPathKey(key)) {
      if (typeof value === 'string' && value) {
        layer[key] = resolve(layerRoot, value)
      }
    }
  }

  if (isPlainObject(layer.clientFiles)) {
    for (const [key, value] of Object.entries(layer.clientFiles)) {
      if (typeof value === 'string' && value) {
        layer.clientFiles[key] = resolve(configDir, value)
      }
    }
  }

  if (isPlainObject(layer.frontends)) {
    for (const frontend of Object.values(layer.frontends)) {
      if (isPlainObject(frontend) && typeof frontend.cwd === 'string') {
        frontend.cwd = resolve(configDir, frontend.cwd)
      }
    }
  }

  if (isPlainObject(layer.scaffold)) {
    for (const [key, value] of Object.entries(layer.scaffold)) {
      if (key === 'pikkuDir' && typeof value === 'string') {
        layer.scaffold[key] = resolve(layerRoot, value)
      } else if (isPlainObject(value) && typeof value.path === 'string') {
        value.path = resolve(layerRoot, value.path)
      }
    }
  }

  return layer
}

const mergeValue = (parent: unknown, child: unknown): unknown => {
  if (isPlainObject(parent) && isPlainObject(child)) {
    return mergeObjects(parent, child)
  }
  return structuredClone(child)
}

const mergeObjects = (
  parent: Record<string, unknown>,
  child: Record<string, unknown>
): Record<string, unknown> => {
  const merged: Record<string, unknown> = structuredClone(parent)
  for (const [key, value] of Object.entries(child)) {
    if (value === undefined) continue
    if (value === null) {
      delete merged[key]
      continue
    }
    merged[key] = mergeValue(merged[key], value)
  }
  return merged
}

/**
 * Merges a child config layer over its parent: objects merge key by key, a
 * path list in `EXTENDS_CONCAT_PATH_LISTS` is the parent's entries followed by
 * the child's new ones, any other value the child sets replaces the parent's,
 * and `null` removes the parent's value. Both layers must already have gone
 * through `resolveLayerPaths`.
 */
export const mergeConfigLayers = (
  parent: ConfigLayer,
  child: ConfigLayer
): ConfigLayer => {
  const merged = mergeObjects(parent, child)
  for (const key of EXTENDS_CONCAT_PATH_LISTS) {
    const fromParent = parent[key]
    const fromChild = child[key]
    if (Array.isArray(fromParent) && Array.isArray(fromChild)) {
      merged[key] = [...new Set([...fromParent, ...fromChild])]
    }
  }
  return merged
}

const loadResolvedLayer = async (
  configFile: string,
  chain: string[]
): Promise<ConfigLayer> => {
  if (chain.includes(configFile)) {
    throw new PikkuCLIConfigError(
      `pikku config "extends" forms a cycle: ${[...chain, configFile].join(' -> ')}`
    )
  }
  const raw: ConfigLayer = JSON.parse(await readFile(configFile, 'utf-8'))
  const configDir = dirname(configFile)
  if (typeof raw.extends !== 'string') {
    return resolveLayerPaths(raw, configDir, true)
  }
  const parent = await loadResolvedLayer(resolve(configDir, raw.extends), [
    ...chain,
    configFile,
  ])
  return mergeConfigLayers(parent, resolveLayerPaths(raw, configDir, false))
}

/**
 * Reads a config that `extends` another and returns the merged input, ready
 * for the same defaulting a config without `extends` gets.
 *
 * Paths come back absolute, except `srcDirectories`, which every consumer joins
 * onto `rootDir` and so is returned relative to the merged `rootDir`.
 */
export const loadExtendedConfigInput = async (
  configFile: string
): Promise<PikkuCLIInput> => {
  const merged = await loadResolvedLayer(resolve(configFile), [])
  const raw = JSON.parse(await readFile(configFile, 'utf-8'))
  merged.extends = raw.extends

  const rootDir = merged.rootDir as string
  if (Array.isArray(merged.srcDirectories)) {
    merged.srcDirectories = merged.srcDirectories.map((dir) =>
      typeof dir === 'string' && isAbsolute(dir)
        ? relative(rootDir, dir) || '.'
        : dir
    )
  }
  return merged as unknown as PikkuCLIInput
}
