import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The conditions that are true for the `import()` this resolution ends in.
 * `default` matches unconditionally and is handled by the resolver rather than
 * listed here, because node treats it as the fallthrough rather than as a name.
 */
const ACTIVE_EXPORT_CONDITIONS = new Set(['node', 'import'])

/**
 * Picks an export target the way node does: a conditions object is walked in
 * DECLARATION order and the first key that is active wins, nesting included.
 *
 * The order is the package author's, not ours. `{ "import": { "node": "./n.js",
 * "default": "./browser.js" } }` resolves to `./n.js`, because `node` is listed
 * first and is true here — preferring a fixed list of condition names instead
 * would hand back the browser build and load a different provider than the one
 * node would have.
 *
 * An array is a list of fallbacks, and `null` is a deliberate block, so both
 * carry on to the next candidate rather than ending the walk.
 */
const resolveExportTarget = (target: unknown): string | undefined => {
  if (typeof target === 'string') return target
  if (target === null || target === undefined) return undefined
  if (Array.isArray(target)) {
    for (const candidate of target) {
      const resolved = resolveExportTarget(candidate)
      if (resolved !== undefined) return resolved
    }
    return undefined
  }
  if (typeof target !== 'object') return undefined
  for (const [condition, value] of Object.entries(target)) {
    if (condition !== 'default' && !ACTIVE_EXPORT_CONDITIONS.has(condition)) {
      continue
    }
    const resolved = resolveExportTarget(value)
    if (resolved !== undefined) return resolved
  }
  return undefined
}

/**
 * The entry an exports map offers to `import`, or, for a package with no
 * exports map at all, its legacy main. A map that deliberately omits a root
 * entry offers nothing: falling back to `main` there would reach past the
 * encapsulation the package asked for, so this reports no entry and the caller
 * treats the provider as missing.
 */
const esmEntryFromManifest = (
  manifest: any,
  subpath: string
): string | undefined => {
  const exportsField = manifest.exports
  if (exportsField === undefined || exportsField === null) {
    if (subpath !== '.') return subpath
    const legacy = manifest.module ?? manifest.main
    return typeof legacy === 'string' ? legacy : undefined
  }
  const isSubpathMap =
    typeof exportsField === 'object' &&
    !Array.isArray(exportsField) &&
    Object.keys(exportsField).some((key) => key.startsWith('.'))
  if (!isSubpathMap) {
    return subpath === '.' ? resolveExportTarget(exportsField) : undefined
  }
  return resolveExportTarget(exportsField[subpath])
}

/**
 * Finds the file an `import` of a package, or of one of its subpaths, would
 * load, for a package `require.resolve` refuses because it offers only ESM.
 * Subpath patterns (`./*`) are not read.
 */
export const resolveEsmOnlyEntry = (
  require: NodeRequire,
  specifier: string
): string | undefined => {
  const parts = specifier.split('/')
  const nameLength = specifier.startsWith('@') ? 2 : 1
  const packageName = parts.slice(0, nameLength).join('/')
  const rest = parts.slice(nameLength).join('/')
  const searchPaths = require.resolve.paths(packageName) ?? []
  for (const searchPath of searchPaths) {
    const packageJsonPath = join(searchPath, packageName, 'package.json')
    if (!existsSync(packageJsonPath)) continue
    let manifest: any
    try {
      manifest = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    } catch {
      return undefined
    }
    const entry = esmEntryFromManifest(manifest, rest ? `./${rest}` : '.')
    if (!entry) return undefined
    return join(searchPath, packageName, entry)
  }
  return undefined
}
