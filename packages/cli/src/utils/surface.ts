import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { parseVersionedId } from '@pikku/core/ecosystem/types'
import type { VersionManifest } from '@pikku/inspector'
import {
  readMetaSnapshot,
  type MetaDiffCategoryName,
  type MetaSnapshot,
} from './meta-diff.js'

/**
 * A "surface" is everything about a build that a client can observe: the
 * functions, the JSON Schemas of what they take and return, and the wirings
 * that expose them. It is derived from `.pikku` rather than stored there, so a
 * baseline can be a checkout on disk or a snapshot published from CI — the
 * comparison is the same either way.
 */

export const SURFACE_SCHEMA_VERSION = 1

/** Meta categories that expose a function to a client. */
export type WiringCategory = Exclude<MetaDiffCategoryName, 'functions'>

export interface SurfaceFunction {
  /** Function id with any `@vN` suffix stripped. */
  key: string
  version: number
  inputSchemaName: string | null
  outputSchemaName: string | null
  contractHash?: string
}

export interface Surface {
  schemaVersion: number
  generatedAt: string
  /** Keyed by function id exactly as the meta records it, `@vN` included. */
  functions: Record<string, SurfaceFunction>
  /** Only the schemas some function actually references. */
  schemas: Record<string, unknown>
  wirings: Partial<Record<WiringCategory, Record<string, unknown>>>
  /**
   * `functionKey → published version numbers`, lifted from
   * `versions.pikku.json`. Published versions are immutable, so a version the
   * manifest still records is still being served even when the source has
   * moved on — that is what stops a `@v2` bump reading as a removal.
   */
  publishedVersions: Record<string, number[]>
}

interface FunctionMetaEntry {
  inputSchemaName?: string | null
  outputSchemaName?: string | null
  contractHash?: string
  version?: number
  remote?: boolean
}

const SCHEMA_SUFFIX = '.schema.json'

function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return undefined
  }
}

/**
 * Generated schemas live at `<pikkuDir>/schemas/schemas/<Name>.schema.json`
 * (the `schemaDirectory` default), each file one self-contained schema.
 */
function readSchemas(
  pikkuDir: string,
  wanted: Set<string>
): Record<string, unknown> {
  const dir = join(pikkuDir, 'schemas', 'schemas')
  if (!existsSync(dir)) return {}
  const schemas: Record<string, unknown> = {}
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(SCHEMA_SUFFIX)) continue
    const name = file.slice(0, -SCHEMA_SUFFIX.length)
    if (!wanted.has(name)) continue
    const schema = readJsonFile(join(dir, file))
    if (schema !== undefined) schemas[name] = schema
  }
  return schemas
}

function readPublishedVersions(manifest: VersionManifest | null) {
  const published: Record<string, number[]> = {}
  if (!manifest) return published
  for (const [key, entry] of Object.entries(manifest.contracts)) {
    const versions = Object.keys(entry.versions)
      .map(Number)
      .filter((v) => Number.isInteger(v))
      .sort((a, b) => a - b)
    if (versions.length > 0) published[key] = versions
  }
  return published
}

/** Build a surface from a generated `.pikku` directory. */
export function readSurface(
  pikkuDir: string,
  manifest: VersionManifest | null = null
): Surface {
  const snapshot: MetaSnapshot = readMetaSnapshot(pikkuDir)

  const functions: Record<string, SurfaceFunction> = {}
  const wanted = new Set<string>()

  for (const [id, raw] of Object.entries(snapshot.functions ?? {})) {
    const meta = (raw ?? {}) as FunctionMetaEntry
    // A remote function is another service's surface, not this one's.
    if (meta.remote === true) continue
    const parsed = parseVersionedId(id)
    const inputSchemaName = meta.inputSchemaName ?? null
    const outputSchemaName = meta.outputSchemaName ?? null
    if (inputSchemaName) wanted.add(inputSchemaName)
    if (outputSchemaName) wanted.add(outputSchemaName)
    functions[id] = {
      key: parsed.baseName,
      version: parsed.version ?? meta.version ?? 1,
      inputSchemaName,
      outputSchemaName,
      contractHash: meta.contractHash,
    }
  }

  const wirings: Surface['wirings'] = {}
  for (const [category, entries] of Object.entries(snapshot)) {
    if (category === 'functions' || !entries) continue
    if (Object.keys(entries).length === 0) continue
    wirings[category as WiringCategory] = entries
  }

  return {
    schemaVersion: SURFACE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    functions,
    schemas: readSchemas(pikkuDir, wanted),
    wirings,
    publishedVersions: readPublishedVersions(manifest),
  }
}

function assertSurface(value: unknown, source: string): Surface {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Baseline at ${source} is not a surface snapshot.`)
  }
  const surface = value as Partial<Surface>
  if (typeof surface.functions !== 'object' || surface.functions === null) {
    throw new Error(
      `Baseline at ${source} is not a surface snapshot (no "functions" map). Produce one with \`pikku semver --emit\`.`
    )
  }
  if (
    typeof surface.schemaVersion === 'number' &&
    surface.schemaVersion > SURFACE_SCHEMA_VERSION
  ) {
    throw new Error(
      `Baseline at ${source} was written by a newer Pikku (snapshot version ${surface.schemaVersion}, this CLI understands ${SURFACE_SCHEMA_VERSION}).`
    )
  }
  return {
    schemaVersion: surface.schemaVersion ?? SURFACE_SCHEMA_VERSION,
    generatedAt: surface.generatedAt ?? '',
    functions: surface.functions as Surface['functions'],
    schemas: surface.schemas ?? {},
    wirings: surface.wirings ?? {},
    publishedVersions: surface.publishedVersions ?? {},
  }
}

export type FetchLike = (url: string) => Promise<{
  ok: boolean
  status: number
  statusText: string
  text(): Promise<string>
}>

/**
 * Resolve a baseline. A URL fetches a published snapshot; a path is read as a
 * `.pikku` directory when it is one, and as a snapshot file otherwise — so
 * `--against ../other-app/.pikku` and `--against ./prod-surface.json` both work
 * without a second flag to say which is which.
 */
export async function loadSurface(
  source: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<Surface> {
  if (/^https?:\/\//.test(source)) {
    const response = await fetchImpl(source)
    if (!response.ok) {
      throw new Error(
        `Could not fetch baseline surface from ${source}: ${response.status} ${response.statusText}`
      )
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(await response.text())
    } catch {
      throw new Error(`Baseline at ${source} is not valid JSON.`)
    }
    return assertSurface(parsed, source)
  }

  if (!existsSync(source)) {
    throw new Error(`Baseline not found: ${source}`)
  }

  if (statSync(source).isDirectory()) {
    const manifestPath = join(source, '..', 'versions.pikku.json')
    const manifest = existsSync(manifestPath)
      ? (readJsonFile(manifestPath) as VersionManifest | undefined)
      : undefined
    return readSurface(source, manifest ?? null)
  }

  const parsed = readJsonFile(source)
  if (parsed === undefined) {
    throw new Error(`Baseline at ${source} is not valid JSON.`)
  }
  return assertSurface(parsed, source)
}
