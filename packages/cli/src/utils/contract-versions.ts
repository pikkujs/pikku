import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'
import type { VersionManifest } from '@pikku/inspector'
import { serializeManifest } from '@pikku/inspector'

export type {
  ContractEntry,
  ValidationError,
  VersionManifest,
  VersionManifestEntry,
} from '@pikku/inspector'
export {
  validateContracts,
  updateManifest,
  extractContractsFromMeta,
  createEmptyManifest,
  serializeManifest,
} from '@pikku/inspector'

export async function loadManifest(
  manifestPath: string
): Promise<VersionManifest | null> {
  try {
    const content = await readFile(manifestPath, 'utf-8')
    const manifest: VersionManifest = JSON.parse(content)
    if (manifest.manifestVersion !== 1) {
      throw new Error(
        `Unsupported manifest version: ${manifest.manifestVersion}`
      )
    }
    return manifest
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function saveManifest(
  manifestPath: string,
  manifest: VersionManifest
): Promise<void> {
  await mkdir(dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, serializeManifest(manifest), 'utf-8')
}
