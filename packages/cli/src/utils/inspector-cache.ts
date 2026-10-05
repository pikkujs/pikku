import { createHash } from 'node:crypto'
import { statSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface InspectorCache {
  fingerprint: string
  inspected: string[]
  state: unknown
}

const PROJECT_INPUTS = [
  'pikku.config.json',
  'tsconfig.json',
  'package.json',
  'versions.pikku.json',
  'bun.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]

const cliBuild = fileURLToPath(import.meta.url)

export const inspectorCachePath = (outDir: string): string =>
  path.join(outDir, 'inspector-cache.json')

const stamp = (file: string): string => {
  try {
    const { mtimeMs, size } = statSync(file)
    return `${mtimeMs}:${size}`
  } catch {
    return 'missing'
  }
}

export const inspectorFingerprint = (
  rootDir: string,
  sources: string[],
  inspected: string[]
): string => {
  const files = new Set([
    cliBuild,
    ...PROJECT_INPUTS.map((name) => path.join(rootDir, name)),
    ...sources,
    ...inspected,
  ])
  const hash = createHash('sha256')
  for (const file of [...files].sort()) {
    hash.update(`${file}\0${stamp(file)}\n`)
  }
  return hash.digest('hex')
}

export const writeInspectorCache = async (
  outDir: string,
  cache: InspectorCache
): Promise<void> => {
  await mkdir(outDir, { recursive: true })
  await writeFile(inspectorCachePath(outDir), JSON.stringify(cache), 'utf-8')
}

export const readInspectorCache = async (
  outDir: string,
  rootDir: string,
  sources: string[]
): Promise<InspectorCache | undefined> => {
  let cache: InspectorCache
  try {
    cache = JSON.parse(await readFile(inspectorCachePath(outDir), 'utf-8'))
  } catch {
    return undefined
  }
  return inspectorFingerprint(rootDir, sources, cache.inspected) ===
    cache.fingerprint
    ? cache
    : undefined
}
