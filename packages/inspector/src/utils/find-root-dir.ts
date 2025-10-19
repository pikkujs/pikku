import path from 'path'

/**
 * Finds the common ancestor directory of all the given file paths.
 * This is used to determine the project root directory.
 *
 * @param filePaths - Array of absolute file paths
 * @returns The common ancestor directory path
 *
 * @example
 * findCommonAncestor([
 *   '/Users/yasser/git/pikku/pikku/src/functions/a.ts',
 *   '/Users/yasser/git/pikku/pikku/src/routes/b.ts'
 * ])
 * // Returns: '/Users/yasser/git/pikku/pikku'
 */
export function findCommonAncestor(filePaths: string[]): string {
  if (filePaths.length === 0) {
    return process.cwd()
  }

  if (filePaths.length === 1) {
    return path.dirname(filePaths[0]!)
  }

  // Normalize all paths and get their directory parts
  const normalizedPaths = filePaths.map((p) =>
    path.dirname(path.normalize(p)).split(path.sep)
  )

  // Start with the first path's parts
  const firstPath = normalizedPaths[0]!
  let commonParts: string[] = []

  // Check each part of the first path
  for (let i = 0; i < firstPath.length; i++) {
    const part = firstPath[i]!

    // Check if this part exists in all other paths at the same position
    const existsInAll = normalizedPaths.every(
      (pathParts) => pathParts[i] === part
    )

    if (existsInAll) {
      commonParts.push(part)
    } else {
      break
    }
  }

  // If no common parts, return root
  if (commonParts.length === 0) {
    return path.sep
  }

  return commonParts.join(path.sep)
}

/**
 * Converts an absolute file path to a relative path from the root directory.
 *
 * @param absolutePath - The absolute file path
 * @param rootDir - The root directory to make the path relative to
 * @returns A relative path from rootDir to the file
 */
export function toRelativePath(absolutePath: string, rootDir: string): string {
  return path.relative(rootDir, absolutePath)
}
