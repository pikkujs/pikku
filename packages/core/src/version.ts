const VERSION_SEPARATOR = '@v'

export function formatVersionedId(baseName: string, version: number): string {
  return `${baseName}${VERSION_SEPARATOR}${version}`
}

export function parseVersionedId(id: string): {
  baseName: string
  version: number | null
} {
  const idx = id.lastIndexOf(VERSION_SEPARATOR)
  if (idx === -1) {
    return { baseName: id, version: null }
  }
  const versionStr = id.slice(idx + VERSION_SEPARATOR.length)
  const version = Number(versionStr)
  if (!Number.isInteger(version) || version < 1) {
    return { baseName: id, version: null }
  }
  return { baseName: id.slice(0, idx), version }
}

export function isVersionedId(id: string): boolean {
  return parseVersionedId(id).version !== null
}
