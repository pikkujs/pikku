import { canonicalJSON, hashString } from './hash.js'

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

export function computeContractHash(data: {
  functionKey: string
  inputSchema: unknown
  outputSchema: unknown
}): string {
  return hashString(canonicalJSON(data), 16)
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
