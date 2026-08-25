import type ts from 'typescript'
import type { PathToNameAndType } from '../types.js'

/**
 * Resolves the one interface extending a core type (`CoreConfig`,
 * `CoreSingletonServices`, `CoreServices`) to the `ts.Type` the AST walk
 * recorded for it.
 *
 * `typesLookup` is keyed by whatever the project named the interface, so
 * reading it under a hardcoded `'SingletonServices'` only works for projects
 * that follow the scaffold's naming. A project that renamed the interface still
 * satisfies every required-type check and then resolves to no services at all,
 * which surfaces far downstream as PKU724 or as every service turning optional.
 * The import map carries the real name, and `getFilesAndMethods` already
 * rejects a second declaration — so taking the first entry is taking the only.
 */
export const resolveCoreType = (
  typesLookup: Map<string, ts.Type[]>,
  importMap: PathToNameAndType
): ts.Type | undefined => {
  for (const entries of importMap.values()) {
    for (const { type } of entries) {
      const resolved = type ? typesLookup.get(type)?.[0] : undefined
      if (resolved) {
        return resolved
      }
    }
  }
  return undefined
}
