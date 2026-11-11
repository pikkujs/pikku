const VERSION_SEPARATOR = '@v'

/** The id of one version of a function: `name@v2`. */
export function formatVersionedId(baseName: string, version: number): string {
  return `${baseName}${VERSION_SEPARATOR}${version}`
}

/**
 * Splits `name@vN` into its base name and version. An id with no `@v` suffix,
 * or whose suffix is not a positive integer, is returned whole with `version:
 * null`.
 */
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

/** Whether `id` carries a valid `@vN` version suffix. */
export function isVersionedId(id: string): boolean {
  return parseVersionedId(id).version !== null
}
