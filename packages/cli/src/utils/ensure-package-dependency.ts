import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CLILogger } from '../services/cli-logger.service.js'

type PackageJson = {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const findPackageJson = async (
  fromDir: string,
  accept: (pkg: PackageJson) => boolean = (pkg) => !!pkg.name
): Promise<{ path: string; pkg: PackageJson } | undefined> => {
  let dir = fromDir
  while (true) {
    const path = join(dir, 'package.json')
    if (existsSync(path)) {
      let pkg: PackageJson | undefined
      try {
        pkg = JSON.parse(await readFile(path, 'utf-8')) as PackageJson
      } catch {}
      if (pkg && accept(pkg)) return { path, pkg }
    }
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/** The range this CLI itself was published against, so a generated file never asks for a version the CLI was not built with. */
const ownRange = async (name: string): Promise<string | undefined> => {
  const own = await findPackageJson(
    dirname(fileURLToPath(import.meta.url)),
    (pkg) => pkg.name === '@pikku/cli'
  )
  return own?.pkg.dependencies?.[name] ?? own?.pkg.devDependencies?.[name]
}

/**
 * Declares `name` in the package that owns `generatedFile`, when a generated
 * file imports a package that package does not list.
 */
export const ensurePackageDependency = async (
  logger: CLILogger,
  generatedFile: string,
  name: string
): Promise<void> => {
  const found = await findPackageJson(dirname(generatedFile))
  if (!found) return
  const { path, pkg } = found
  if (
    pkg.dependencies?.[name] ||
    pkg.devDependencies?.[name] ||
    pkg.peerDependencies?.[name]
  ) {
    return
  }
  const range = await ownRange(name)
  if (!range) return
  const dependencies = { ...pkg.dependencies, [name]: range }
  pkg.dependencies = Object.fromEntries(
    Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))
  )
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, `${JSON.stringify(pkg, null, 2)}\n`)
  await rename(tmp, path)
  logger.info(
    `Added ${name}@${range} to ${relative(process.cwd(), path) || path} — run your package manager's install`
  )
}
