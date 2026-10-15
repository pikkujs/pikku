import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  ADDONS_META_FILE,
  type AddonsMeta,
} from '../wirings/functions/serialize-addon-types.js'
import { MOCKS_DIR, type AddonMocksSource } from './read.js'

export const readAddonsMeta = (pikkuDir: string): AddonsMeta => {
  try {
    return JSON.parse(readFileSync(join(pikkuDir, ADDONS_META_FILE), 'utf8'))
  } catch {
    return {}
  }
}

export const findPackageDir = (
  pkg: string,
  from: string[]
): string | undefined => {
  for (const start of from) {
    let dir = resolve(start)
    while (true) {
      const candidate = join(dir, 'node_modules', pkg)
      if (existsSync(join(candidate, 'package.json')))
        return realpathSync(candidate)
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return undefined
}

export const addonMockSources = (
  addons: Iterable<[string, { package: string; remote?: boolean }]>,
  from: string[]
): AddonMocksSource[] =>
  [...addons].flatMap(([namespace, addon]) => {
    if (addon.remote) return []
    const pkgDir = findPackageDir(addon.package, from)
    return pkgDir
      ? [{ namespace, package: addon.package, dir: join(pkgDir, MOCKS_DIR) }]
      : []
  })

export const projectAddonMockSources = (
  rootDir: string,
  outDir: string
): AddonMocksSource[] => {
  const pikkuDir = resolve(rootDir, outDir)
  return addonMockSources(Object.entries(readAddonsMeta(pikkuDir)), [
    dirname(pikkuDir),
    rootDir,
  ])
}
