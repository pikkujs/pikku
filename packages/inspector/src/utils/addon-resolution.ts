import { existsSync } from 'fs'
import { createRequire } from 'module'
import { join, dirname, parse, resolve } from 'path'

export type AddonResolver = { resolve: (id: string) => string }

const nearestPackageDir = (file: string): string | null => {
  const root = parse(file).root
  let dir = dirname(file)
  while (dir && dir !== root) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * An addon is installed wherever the package that calls `wireAddon` lists it,
 * which in a workspace is usually not the repo root. Resolve from the declaring
 * package first, as its code does at runtime, then from the root.
 */
export const addonResolutionDirs = (
  rootDir: string,
  declFile?: string
): string[] => {
  const root = resolve(rootDir)
  const declDir = declFile ? nearestPackageDir(declFile) : null
  return declDir && declDir !== root ? [declDir, root] : [root]
}

export const createAddonResolver = (dirs: string[]): AddonResolver => {
  const requires = dirs.map((dir) => createRequire(join(dir, 'package.json')))
  return {
    resolve: (id: string) => {
      let lastError: unknown
      for (const req of requires) {
        try {
          return req.resolve(id)
        } catch (e) {
          lastError = e
        }
      }
      throw lastError
    },
  }
}
