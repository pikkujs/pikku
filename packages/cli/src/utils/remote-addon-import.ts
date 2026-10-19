import { dirname, relative, sep } from 'node:path'
import { checkLockedSdk } from '@pikku/inspector/lite'

/**
 * The specifier a generated file imports an addon's generated `leaf` (e.g.
 * `rpc/pikku-rpc-wirings-map.remote.gen.js`) from.
 *
 * An installed addon is reached through its package: `<package>/.pikku/<leaf>`.
 * A versioned `wireRemoteAddon` has no package installed; its types are in the
 * SDK `pikku addon sync` extracted, so the import is a relative path from
 * `fromFile` into `.pikku/remote/<name>@<version>/<leaf>`. When that SDK does
 * not match the lock the package path is kept, and the inspector has already
 * reported PKU338 for it.
 */
export const addonGeneratedImport = (
  decl: { package: string; range?: string },
  leaf: string,
  fromFile: string,
  rootDir: string | undefined
): string => {
  if (decl.range && rootDir) {
    let locked: ReturnType<typeof checkLockedSdk> | null = null
    try {
      locked = checkLockedSdk(rootDir, decl.package, decl.range)
    } catch {
      // An unreadable lock is reported by the inspector.
    }
    if (locked?.ok) {
      const path = relative(dirname(fromFile), locked.dir).split(sep).join('/')
      return `${path.startsWith('.') ? path : `./${path}`}/${leaf}`
    }
  }
  return `${decl.package}/.pikku/${leaf}`
}
