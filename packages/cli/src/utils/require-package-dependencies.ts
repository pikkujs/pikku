import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

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
    // A deploy unit's package.json is written by the bundler from what the
    // bundle imports, so the project that owns the unit is the one to check.
    const generated = dir.split(sep).includes('.deploy')
    if (!generated && existsSync(path)) {
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
 * Fails when a generated file imports a package that the package owning it
 * does not list. The CLI never edits a project's dependencies: the error names
 * each missing package, the range this CLI was built against, and the
 * package.json to add it to.
 */
export const requirePackageDependencies = async (
  generatedFile: string,
  names: readonly string[]
): Promise<void> => {
  const found = await findPackageJson(dirname(generatedFile))
  if (!found) return
  const { path, pkg } = found
  const missing = names.filter(
    (name) =>
      !pkg.dependencies?.[name] &&
      !pkg.devDependencies?.[name] &&
      !pkg.peerDependencies?.[name]
  )
  if (missing.length === 0) return
  const lines = await Promise.all(
    missing.map(async (name) => {
      const range = await ownRange(name)
      return `  "${name}": "${range ?? '*'}"`
    })
  )
  throw new Error(
    `${relative(process.cwd(), generatedFile) || generatedFile} imports ${
      missing.length === 1 ? 'a package' : 'packages'
    } that ${relative(process.cwd(), path) || path} does not list. Add to its "dependencies" and run your package manager's install:\n${lines.join('\n')}`
  )
}

/**
 * Every package the package owning `generatedFile` declares, whichever field
 * declares it — for a generated file that must only import what that package
 * can actually resolve.
 */
export const declaredPackageDependencies = async (
  generatedFile: string
): Promise<Set<string>> => {
  const found = await findPackageJson(dirname(generatedFile))
  if (!found) return new Set()
  const { pkg } = found
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ])
}
