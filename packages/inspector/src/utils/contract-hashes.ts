import { FunctionsMeta, JSONValue, parseVersionedId } from '@pikku/core'
import { TypesMap } from '../types-map.js'
import { ErrorCode } from '../error-codes.js'
import { canonicalJSON, hashString } from './hash.js'

export type ContractEntry = {
  functionKey: string
  version: number
  contractHash: string
}

export type VersionValidateError = {
  code: ErrorCode
  message: string
}

export type VersionManifestEntry = {
  latest: number
  versions: Record<string, string>
}

export type VersionManifest = {
  manifestVersion: 1
  contracts: Record<string, VersionManifestEntry>
}

export function createEmptyManifest(): VersionManifest {
  return {
    manifestVersion: 1,
    contracts: {},
  }
}

export function serializeManifest(manifest: VersionManifest): string {
  const sortedContracts: Record<string, VersionManifestEntry> = {}

  for (const key of Object.keys(manifest.contracts).sort()) {
    const entry = manifest.contracts[key]
    const sortedVersions: Record<string, string> = {}
    const numericKeys = Object.keys(entry.versions)
      .map(Number)
      .sort((a, b) => a - b)
    for (const vk of numericKeys) {
      sortedVersions[String(vk)] = entry.versions[String(vk)]
    }
    sortedContracts[key] = {
      latest: entry.latest,
      versions: sortedVersions,
    }
  }

  const sorted: VersionManifest = {
    manifestVersion: manifest.manifestVersion,
    contracts: sortedContracts,
  }

  return JSON.stringify(sorted, null, 2) + '\n'
}

export function computeContractHash(data: {
  functionKey: string
  inputSchema: unknown
  outputSchema: unknown
}): string {
  return hashString(canonicalJSON(data), 16)
}

function resolveSchema(
  typeNames: string[] | null | undefined,
  allSchemas: Record<string, JSONValue>,
  typesMap: TypesMap
): unknown {
  if (!typeNames) {
    return null
  }
  const filtered = typeNames.filter((n) => n !== 'void')
  if (filtered.length === 0) {
    return null
  }
  const parts: unknown[] = []
  for (const name of filtered) {
    let key: string
    try {
      key = typesMap.getUniqueName(name)
    } catch {
      key = name
    }
    const schema = allSchemas[key]
    if (schema) {
      parts.push(schema)
    }
  }
  if (parts.length === 0) {
    return null
  }
  return parts.length === 1 ? parts[0] : parts
}

export function buildCurrentContracts(
  functionsMeta: FunctionsMeta,
  allSchemas: Record<string, JSONValue>,
  typesMap: TypesMap
): Map<string, ContractEntry> {
  const result = new Map<string, ContractEntry>()

  for (const [funcId, meta] of Object.entries(functionsMeta)) {
    if (meta.internal === true) {
      continue
    }

    const parsed = parseVersionedId(funcId)
    const functionKey = parsed.baseName
    const version = parsed.version ?? meta.version ?? 1

    const inputSchema = resolveSchema(meta.inputs, allSchemas, typesMap)
    const outputSchema = resolveSchema(meta.outputs, allSchemas, typesMap)

    const contractHash = computeContractHash({
      functionKey,
      inputSchema,
      outputSchema,
    })
    result.set(funcId, { functionKey, version, contractHash })
  }

  return result
}

export function computeContractHashes(
  allSchemas: Record<string, JSONValue>,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta
): Map<string, ContractEntry> {
  const contracts = buildCurrentContracts(functionsMeta, allSchemas, typesMap)

  for (const [funcId, entry] of contracts) {
    const meta = functionsMeta[funcId]
    if (meta) {
      meta.contractHash = entry.contractHash
    }
  }

  return contracts
}

function groupByFunctionKey(
  contracts: Map<string, ContractEntry>
): Map<string, ContractEntry[]> {
  const grouped = new Map<string, ContractEntry[]>()
  for (const entry of contracts.values()) {
    const existing = grouped.get(entry.functionKey) ?? []
    existing.push(entry)
    grouped.set(entry.functionKey, existing)
  }
  return grouped
}

export function validateContracts(
  manifest: VersionManifest,
  currentContracts: Map<string, ContractEntry>
): { valid: boolean; errors: VersionValidateError[] } {
  const errors: VersionValidateError[] = []
  const grouped = groupByFunctionKey(currentContracts)
  const reportedKeys = new Set<string>()

  for (const [functionKey, entries] of grouped) {
    const manifestEntry = manifest.contracts[functionKey]
    if (!manifestEntry) {
      continue
    }

    for (const { version, contractHash } of entries) {
      const existingHash = manifestEntry.versions[String(version)]

      if (existingHash !== undefined) {
        if (existingHash !== contractHash) {
          reportedKeys.add(`${functionKey}@${version}`)
          errors.push({
            code: ErrorCode.FUNCTION_VERSION_MODIFIED,
            message: `Contract for ${functionKey}@v${version} has changed (recorded: ${existingHash}, current: ${contractHash}). Existing versions are immutable.`,
          })
        }
      } else {
        if (version <= manifestEntry.latest) {
          errors.push({
            code: ErrorCode.VERSION_REGRESSION_OR_CONFLICT,
            message: `Version ${version} for ${functionKey} is <= latest (${manifestEntry.latest}) but not recorded. Possible merge conflict.`,
          })
        } else if (version > manifestEntry.latest + 1) {
          errors.push({
            code: ErrorCode.VERSION_GAP_NOT_ALLOWED,
            message: `Version ${version} for ${functionKey} skips versions. Latest is ${manifestEntry.latest}, next must be ${manifestEntry.latest + 1}.`,
          })
        }
      }
    }
  }

  for (const [functionKey, manifestEntry] of Object.entries(
    manifest.contracts
  )) {
    const latestHash = manifestEntry.versions[String(manifestEntry.latest)]
    const currentEntries = grouped.get(functionKey)
    if (!currentEntries) {
      continue
    }

    const currentLatest = currentEntries.find(
      (e) => e.version === manifestEntry.latest
    )
    if (
      currentLatest &&
      currentLatest.contractHash !== latestHash &&
      !reportedKeys.has(`${functionKey}@${manifestEntry.latest}`)
    ) {
      errors.push({
        code: ErrorCode.CONTRACT_CHANGED_REQUIRES_BUMP,
        message: `Contract for ${functionKey} changed. Set \`version: ${manifestEntry.latest + 1}\` on the function or run 'pikku versions update'.`,
      })
    }
  }

  for (const [functionKey, manifestEntry] of Object.entries(
    manifest.contracts
  )) {
    const numericKeys = Object.keys(manifestEntry.versions).map(Number)
    if (numericKeys.length === 0) {
      continue
    }
    const maxVersion = Math.max(...numericKeys)
    if (manifestEntry.latest !== maxVersion) {
      errors.push({
        code: ErrorCode.MANIFEST_INTEGRITY_ERROR,
        message: `Manifest integrity error for ${functionKey}: latest field (${manifestEntry.latest}) inconsistent with version keys (max: ${maxVersion}).`,
      })
    }
  }

  return { valid: errors.length === 0, errors }
}

export function updateManifest(
  existing: VersionManifest,
  currentContracts: Map<string, ContractEntry>
): VersionManifest {
  const manifest: VersionManifest = {
    manifestVersion: existing.manifestVersion,
    contracts: JSON.parse(JSON.stringify(existing.contracts)),
  }

  const grouped = groupByFunctionKey(currentContracts)

  for (const [functionKey, entries] of grouped) {
    if (!manifest.contracts[functionKey]) {
      manifest.contracts[functionKey] = { latest: 0, versions: {} }
    }

    const entry = manifest.contracts[functionKey]
    for (const { version, contractHash } of entries) {
      entry.versions[String(version)] = contractHash
      entry.latest = Math.max(entry.latest, version)
    }
  }

  return manifest
}

export function extractContractsFromMeta(
  functionsMeta: FunctionsMeta
): Map<string, ContractEntry> {
  const result = new Map<string, ContractEntry>()

  for (const [funcId, meta] of Object.entries(functionsMeta)) {
    if (meta.internal === true || !meta.contractHash) {
      continue
    }

    const parsed = parseVersionedId(funcId)
    const functionKey = parsed.baseName
    const version = parsed.version ?? meta.version ?? 1

    result.set(funcId, {
      functionKey,
      version,
      contractHash: meta.contractHash,
    })
  }

  return result
}
