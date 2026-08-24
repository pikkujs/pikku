import { createRequire } from 'node:module'
import { join } from 'node:path'

/**
 * Resolves a package as the *project* would, not as the CLI would.
 *
 * The CLI is frequently run from somewhere that is not the project — `npx`
 * unpacks it into `~/.npm/_npx/<hash>`, a monorepo hoists it to the workspace
 * root — so a bare `import('pkg')` from CLI code finds the copy sitting next to
 * the CLI. For a package that peers on `@pikku/core` that is the wrong copy:
 * it gets paired with the CLI's core rather than the project's, and the version
 * skew surfaces as a missing subpath export from a package the project never
 * imported. Resolving against the project's own package.json keeps one core in
 * play.
 */
export const resolveFromProject = (
  rootDir: string,
  specifier: string
): string | undefined => {
  try {
    return createRequire(join(rootDir, 'package.json')).resolve(specifier)
  } catch {
    return undefined
  }
}

/**
 * Recovers a CommonJS package's exports from an import by path.
 *
 * Node reconstructs a CJS module's named exports only when it is imported by
 * bare specifier. Imported by absolute path — which is the whole point of
 * resolving from the project — the namespace carries `default` and nothing
 * else, so a package like `ws`, which hangs `WebSocketServer` off
 * `module.exports`, arrives with the constructor apparently missing. `probe` is
 * the export that decides which of the two shapes came back.
 */
export const cjsInterop = <T>(mod: T, probe: string): T =>
  probe in (mod as object)
    ? mod
    : (((mod as { default?: T }).default ?? mod) as T)

/**
 * Imports a package resolved from the project, or `undefined` when it is not
 * installed there. Callers decide whether absence is fatal.
 */
export const importFromProject = async <T>(
  rootDir: string,
  specifier: string
): Promise<T | undefined> => {
  const resolved = resolveFromProject(rootDir, specifier)
  if (!resolved) return undefined
  return (await import(resolved)) as T
}
