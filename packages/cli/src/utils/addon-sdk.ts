import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, posix, relative, resolve } from 'node:path'
import semver from 'semver'
import { computeContractHash, TypesMap } from '@pikku/inspector/lite'
import { parseVersionedId } from '@pikku/core/utils'
import { bumpVersion } from './release.js'
import { SURFACE_SCHEMA_VERSION, type Surface } from './surface.js'
import { computeSurfaceDiff, type SurfaceChanges } from './surface-diff.js'
import { unpackTarGz } from './sdk-tarball.js'

/**
 * An addon SDK is the types-only contract a `wireRemoteAddon` consumer builds
 * against: the remote RPC map, the workflow and agent maps, and the meta of the
 * functions it can call. Nothing in it may reach outside it except
 * `@pikku/core`, because the consumer has the SDK and nothing else.
 */

export const SDK_MANIFEST = 'manifest.json'
export const SDK_RPC_MAP = 'rpc/pikku-rpc-wirings-map.remote.gen.d.ts'
export const SDK_WORKFLOW_MAP = 'workflow/pikku-workflow-map.gen.d.ts'
export const SDK_AGENT_MAP = 'agent/pikku-agent-map.gen.d.ts'
export const SDK_FUNCTIONS_META = 'function/pikku-functions-meta.gen.json'

export interface SdkManifest {
  name: string
  version: string
  pikkuCore: string
  contractHash: string
}

export class SdkImportError extends Error {}

/** A generated declaration: where it would sit in the addon's output, and its text. */
export interface SdkDeclaration {
  path: string
  content: string
}

/**
 * What an SDK is cut from: the maps serialized for the SDK's surface alone, the
 * custom types they read, and the addon's function meta and schemas on disk.
 */
export interface SdkSources {
  rpcMap: SdkDeclaration
  workflowMap: SdkDeclaration
  agentMap: SdkDeclaration
  customTypes: SdkDeclaration
  functionsMeta: string
  schemaDirectory: string
  /** The functions the maps declare: the remote RPCs and the exposed workflows. */
  contractFunctionIds: string[]
}

const IDENTIFIER = /[A-Za-z_$][\w$]*/g

/**
 * A types map holding only what `roots` reach: the custom types they name, the
 * custom and source types those reference, and so on. The addon's full map
 * carries every internal function's types; serialized from it, the SDK would
 * declare them too, and import the source of any that are not zod.
 */
export const pruneTypesMap = (
  typesMap: TypesMap,
  roots: string[]
): TypesMap => {
  const pruned = new TypesMap()
  const seen = new Set<string>()
  const visit = (name: string) => {
    if (seen.has(name)) return
    seen.add(name)
    const custom = typesMap.customTypes.get(name)
    if (custom) {
      pruned.customTypes.set(name, custom)
      for (const ref of custom.references) visit(ref)
      for (const id of custom.type.match(IDENTIFIER) ?? []) visit(id)
      return
    }
    let meta: ReturnType<TypesMap['getTypeMeta']>
    try {
      meta = typesMap.getTypeMeta(name)
    } catch {
      return
    }
    if (!meta.path) return
    if (meta.uniqueName === meta.originalName) {
      pruned.addType(meta.originalName, meta.path)
    } else {
      pruned.addUniqueType(meta.originalName, meta.path)
    }
  }
  for (const root of roots) {
    for (const id of root.match(IDENTIFIER) ?? []) visit(id)
  }
  return pruned
}

const SPECIFIER =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|<reference\s+(?:path|types)\s*=\s*)(['"])([^'"\n]+)\2/g

const isAllowedPackage = (specifier: string) =>
  specifier === '@pikku/core' || specifier.startsWith('@pikku/core/')

const isRelative = (specifier: string) =>
  specifier.startsWith('./') || specifier.startsWith('../')

/** A module path with its extension dropped, so `x.gen.d.js` and `x.gen.d.ts` compare equal. */
const moduleKey = (path: string) =>
  path.replace(/\.d\.[cm]?[jt]s$|\.[cm]?[jt]s$/, '')

export const listImportSpecifiers = (source: string): string[] =>
  [...source.matchAll(SPECIFIER)].map((m) => m[3]!)

const refuse = (file: string, specifier: string) =>
  new SdkImportError(
    `SDK file ${file} imports '${specifier}'. An addon SDK is types only: it may import its own files and @pikku/core/*, nothing else. ` +
      `This usually means a remote function's input or output is a TypeScript type from the addon's source — declare it as a zod schema instead (PKU922).`
  )

/**
 * Inline the shared custom-types file into the map that imports it, as the
 * namespace the map already reads it through. The SDK has no custom-types file
 * of its own, and its imports may only be `@pikku/core`, which is hoisted.
 */
const inlineCustomTypes = (
  file: string,
  content: string,
  specifier: string,
  customTypesSource: string,
  hoisted: Set<string>
): string => {
  const statement = new RegExp(
    `^import\\s+type\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s+(['"])${specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\2;?[ \\t]*$`,
    'm'
  )
  const match = statement.exec(content)
  if (!match) throw refuse(file, specifier)
  const namespace = match[1]!

  const body: string[] = []
  for (const line of customTypesSource.split('\n')) {
    const specifiers = listImportSpecifiers(line)
    if (/^\s*import\b/.test(line) && specifiers.length > 0) {
      for (const s of specifiers) {
        if (!isAllowedPackage(s)) throw refuse(file, s)
      }
      hoisted.add(line.trim())
      continue
    }
    body.push(line)
  }
  const block = `declare namespace ${namespace} {\n${body.join('\n').trim()}\n}`
  return content.replace(match[0], () => block)
}

/**
 * Rewrite one generated declaration file for the SDK layout. Each relative
 * import must land on another SDK file (and is re-pointed at it), or on the
 * custom-types file (and is inlined); anything else is refused.
 */
export const rewriteSdkFile = (
  sdkPath: string,
  sourcePath: string,
  content: string,
  layout: Map<string, string>,
  customTypes: { path: string; content: string }
): string => {
  const hoisted = new Set<string>()
  let out = content
  for (const specifier of new Set(listImportSpecifiers(content))) {
    if (isAllowedPackage(specifier)) continue
    if (!isRelative(specifier)) throw refuse(sdkPath, specifier)
    const target = moduleKey(resolve(dirname(sourcePath), specifier))
    if (target === moduleKey(customTypes.path)) {
      out = inlineCustomTypes(
        sdkPath,
        out,
        specifier,
        customTypes.content,
        hoisted
      )
      continue
    }
    const targetSdkPath = layout.get(target)
    if (!targetSdkPath) throw refuse(sdkPath, specifier)
    let rewritten = posix.relative(posix.dirname(sdkPath), targetSdkPath)
    if (!rewritten.startsWith('.')) rewritten = `./${rewritten}`
    rewritten = rewritten.replace(/\.d\.ts$/, '.d.js')
    out = out.replace(
      new RegExp(
        `(['"])${specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`,
        'g'
      ),
      (_m, quote) => `${quote}${rewritten}${quote}`
    )
  }
  const result = hoisted.size > 0 ? `${[...hoisted].join('\n')}\n${out}` : out
  for (const specifier of listImportSpecifiers(result)) {
    if (!isAllowedPackage(specifier) && !isRelative(specifier)) {
      throw refuse(sdkPath, specifier)
    }
  }
  return result
}

type FunctionMetaEntry = {
  remote?: boolean
  expose?: boolean
  version?: number
  inputs?: string[] | null
  outputs?: string[] | null
  inputSchemaName?: string | null
  outputSchemaName?: string | null
  contractHash?: string
  /** Every version of this function's base name the SDK can call, ascending. */
  versions?: number[]
  /** The version a call without `@vN` is sent to. */
  latestVersion?: number
  /** The JSON schema `inputSchemaName` names, so `--bump-from` can diff it. */
  inputSchema?: unknown
  /** The JSON schema `outputSchemaName` names. */
  outputSchema?: unknown
  [key: string]: unknown
}

/** `fn@v2` → 2; an unversioned function is its own v1. */
const versionOf = (id: string, meta: FunctionMetaEntry): number =>
  parseVersionedId(id).version ?? meta.version ?? 1

const readSchema = (schemaDirectory: string, name: string): unknown => {
  const file = join(schemaDirectory, 'schemas', `${name}.schema.json`)
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : undefined
}

const contractSide = (
  schemaDirectory: string,
  names: string[] | null | undefined
): unknown => {
  const parts = (names ?? [])
    .filter((n) => n !== 'void')
    .map((n) => readSchema(schemaDirectory, n))
    .filter((s) => s !== undefined)
  if (parts.length === 0) return null
  return parts.length === 1 ? parts[0] : parts
}

/**
 * The functions a consumer can call — those the SDK's maps declare — each
 * stamped with its contract hash, computed the same way the inspector does,
 * and with the versions of its base name the SDK can call. A consumer sends a
 * call without `@vN` to `latestVersion`: the newest version in this SDK, not
 * the newest the host serves.
 */
export const sdkFunctionsMeta = (
  functionsMeta: Record<string, FunctionMetaEntry>,
  schemaDirectory: string,
  contractFunctionIds: Iterable<string>
): Record<string, FunctionMetaEntry> => {
  const out: Record<string, FunctionMetaEntry> = {}
  const versions = new Map<string, number[]>()
  const contract = new Set(contractFunctionIds)
  for (const id of Object.keys(functionsMeta).sort()) {
    const meta = functionsMeta[id]!
    if (!contract.has(id)) continue
    const baseName = parseVersionedId(id).baseName
    const inputSchema = meta.inputSchemaName
      ? readSchema(schemaDirectory, meta.inputSchemaName)
      : undefined
    const outputSchema = meta.outputSchemaName
      ? readSchema(schemaDirectory, meta.outputSchemaName)
      : undefined
    out[id] = {
      ...meta,
      ...(inputSchema !== undefined ? { inputSchema } : {}),
      ...(outputSchema !== undefined ? { outputSchema } : {}),
      contractHash: computeContractHash({
        functionKey: baseName,
        inputSchema: contractSide(schemaDirectory, meta.inputs),
        outputSchema: contractSide(schemaDirectory, meta.outputs),
      }),
    }
    versions.set(baseName, [
      ...(versions.get(baseName) ?? []),
      versionOf(id, meta),
    ])
  }
  for (const [id, meta] of Object.entries(out)) {
    const available = versions
      .get(parseVersionedId(id).baseName)!
      .sort((a, b) => a - b)
    meta.versions = available
    meta.latestVersion = available[available.length - 1]
  }
  return out
}

/**
 * The id a call without `@vN` goes to, for each base name in an SDK's meta
 * whose latest version the host files under `fn@vN`. A function that was never
 * versioned is filed under its bare name, so its calls keep that name: a host
 * looks an addon function up by its exact id, and has no `fn@v1` for it.
 */
export const sdkDefaultVersions = (
  functions: Record<string, FunctionMetaEntry>
): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [id, meta] of Object.entries(functions)) {
    if (meta.latestVersion === undefined) continue
    const { baseName, version } = parseVersionedId(id)
    if (version === meta.latestVersion) out[baseName] = id
  }
  return out
}

/**
 * The schemas an SDK's functions carry, by the name each one is filed under,
 * for `surface-diff`. An SDK cut before schemas were packed carries none.
 */
export const sdkSchemas = (
  functions: Record<string, FunctionMetaEntry>
): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const meta of Object.values(functions)) {
    if (meta.inputSchemaName && meta.inputSchema !== undefined) {
      out[meta.inputSchemaName] = meta.inputSchema
    }
    if (meta.outputSchemaName && meta.outputSchema !== undefined) {
      out[meta.outputSchemaName] = meta.outputSchema
    }
  }
  return out
}

export const aggregateContractHash = (
  functions: Record<string, { contractHash?: string }>
): string => {
  const pairs = Object.keys(functions)
    .sort()
    .map((id) => [id, functions[id]!.contractHash ?? ''])
  return createHash('sha256').update(JSON.stringify(pairs)).digest('hex')
}

/** `@scope/name` at `1.2.3` → `scope-name-1.2.3.sdk.tgz`, after `npm pack`'s naming. */
export const sdkTarballName = (name: string, version: string) =>
  `${name.replace(/^@/, '').replace(/\//g, '-')}-${version}.sdk.tgz`

export interface PackageInfo {
  name: string
  version?: string
  pikkuCore?: string
}

export const readPackageInfo = (packageJsonPath: string): PackageInfo => {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
    name?: string
    version?: string
    peerDependencies?: Record<string, string>
    dependencies?: Record<string, string>
  }
  if (!pkg.name) throw new Error(`${packageJsonPath} has no "name".`)
  return {
    name: pkg.name,
    version: pkg.version,
    pikkuCore:
      pkg.peerDependencies?.['@pikku/core'] ??
      pkg.dependencies?.['@pikku/core'],
  }
}

/**
 * Cut the SDK from an addon's generated output. Returns the files by their
 * path inside the SDK; nothing is written.
 */
export const buildSdkFiles = (
  sources: SdkSources,
  info: { name: string; version: string; pikkuCore: string }
): { files: Map<string, string>; manifest: SdkManifest } => {
  const declarations: Array<[string, SdkDeclaration]> = [
    [SDK_RPC_MAP, sources.rpcMap],
    [SDK_WORKFLOW_MAP, sources.workflowMap],
    [SDK_AGENT_MAP, sources.agentMap],
  ]
  const layout = new Map(
    declarations.map(([sdkPath, source]) => [moduleKey(source.path), sdkPath])
  )

  const files = new Map<string, string>()
  for (const [sdkPath, source] of declarations) {
    files.set(
      sdkPath,
      rewriteSdkFile(
        sdkPath,
        source.path,
        source.content,
        layout,
        sources.customTypes
      )
    )
  }

  if (!existsSync(sources.functionsMeta)) {
    throw new Error(
      `${sources.functionsMeta} does not exist. Run \`pikku all\` in the addon before \`pikku sdk\`.`
    )
  }
  const functions = sdkFunctionsMeta(
    JSON.parse(readFileSync(sources.functionsMeta, 'utf-8')),
    sources.schemaDirectory,
    sources.contractFunctionIds
  )
  files.set(SDK_FUNCTIONS_META, JSON.stringify(functions, null, 2) + '\n')

  const manifest: SdkManifest = {
    name: info.name,
    version: info.version,
    pikkuCore: info.pikkuCore,
    contractHash: aggregateContractHash(functions),
  }
  files.set(SDK_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
  return { files, manifest }
}

/** An SDK's contract: its function meta, each entry carrying its schemas. */
export interface SdkContract {
  functions: Record<string, FunctionMetaEntry>
}

/** A previous SDK, as a `.sdk.tgz`, an unpacked SDK directory, or its manifest.json. */
export const loadPreviousSdk = (
  source: string
): SdkContract & { manifest: SdkManifest } => {
  if (!existsSync(source)) throw new Error(`Previous SDK not found: ${source}`)
  let manifestText: string | undefined
  let metaText: string | undefined
  if (statSync(source).isDirectory()) {
    manifestText = readFileSync(join(source, SDK_MANIFEST), 'utf-8')
    metaText = readFileSync(join(source, SDK_FUNCTIONS_META), 'utf-8')
  } else if (source.endsWith('.json')) {
    manifestText = readFileSync(source, 'utf-8')
    const sibling = join(dirname(source), SDK_FUNCTIONS_META)
    if (!existsSync(sibling)) {
      throw new Error(
        `${relative(process.cwd(), sibling)} is missing beside ${source}; --bump-from needs the previous SDK's function meta to diff against.`
      )
    }
    metaText = readFileSync(sibling, 'utf-8')
  } else {
    const files = unpackTarGz(readFileSync(source))
    manifestText = files.get(SDK_MANIFEST)?.toString('utf-8')
    metaText = files.get(SDK_FUNCTIONS_META)?.toString('utf-8')
  }
  if (!manifestText || !metaText) {
    throw new Error(
      `${source} is not an addon SDK: it needs ${SDK_MANIFEST} and ${SDK_FUNCTIONS_META}.`
    )
  }
  return {
    manifest: JSON.parse(manifestText),
    functions: JSON.parse(metaText),
  }
}

/**
 * An SDK's contract as a surface `surface-diff` can compare. With the schemas
 * the functions name, a changed contract is told apart as loosened (minor) or
 * tightened (major); an SDK cut before schemas were packed has only hashes, and
 * `surface-diff` counts a moved hash as breaking. A version the SDK still
 * carries is published, so dropping `fn@v1` for `fn@v2` is a removal.
 */
export const sdkSurface = ({ functions }: SdkContract): Surface => ({
  schemaVersion: SURFACE_SCHEMA_VERSION,
  generatedAt: '',
  functions: Object.fromEntries(
    Object.entries(functions).map(([id, meta]) => {
      const parsed = parseVersionedId(id)
      return [
        id,
        {
          key: parsed.baseName,
          version: versionOf(id, meta),
          inputSchemaName: meta.inputSchemaName ?? null,
          outputSchemaName: meta.outputSchemaName ?? null,
          contractHash: meta.contractHash,
        },
      ]
    })
  ),
  schemas: sdkSchemas(functions),
  wirings: {},
  publishedVersions: Object.fromEntries(
    Object.entries(functions).map(([id, meta]) => [
      parseVersionedId(id).baseName,
      meta.versions ?? [versionOf(id, meta)],
    ])
  ),
})

export interface SdkBumpCheck {
  previousVersion: string
  requiredVersion: string
  changes: SurfaceChanges
}

/**
 * The lowest version this SDK may be published at, given the previous one, and
 * a refusal when `version` is below it.
 */
export const checkSdkBump = (
  previous: SdkContract & { manifest: SdkManifest },
  current: SdkContract,
  version: string,
  baseline: string
): SdkBumpCheck => {
  const changes = computeSurfaceDiff(
    sdkSurface(previous),
    sdkSurface(current),
    baseline
  )
  const previousVersion = previous.manifest.version
  const requiredVersion = bumpVersion(previousVersion, changes.verdict)
  if (semver.lt(version, requiredVersion)) {
    const reasons = changes.changes
      .map((c) => `  - ${c.id}: ${c.reasons.join('; ')}`)
      .join('\n')
    throw new Error(
      `SDK version ${version} is too low: the contract change since ${previousVersion} is ${changes.verdict}, so the SDK must be at least ${requiredVersion}.` +
        (reasons ? `\n${reasons}` : '')
    )
  }
  return { previousVersion, requiredVersion, changes }
}
