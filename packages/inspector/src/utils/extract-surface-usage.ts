import { existsSync, readFileSync } from 'fs'
import { basename, dirname, relative, sep } from 'path'
import ts from 'typescript'

/**
 * How often each `#pikku/*` export is imported, and the source areas it was
 * imported from. Counters only: this is accumulated during the sweep that
 * already visits every source file, so nothing here may retain a node.
 */
export type SurfaceUsageCounts = Record<
  string,
  Record<string, { imports: number; seenIn: string[] }>
>

/**
 * The leaf a specifier belongs to. `#pikku/workflow` and the deep
 * `#pikku/workflow/pikku-workflow-types.gen.js` are the same door, so both
 * count against `#pikku/workflow`.
 */
const leafSpecifierOf = (specifier: string): string | null => {
  if (!specifier.startsWith('#pikku/')) return null
  const leaf = specifier.slice('#pikku/'.length).split('/')[0]
  // A root-level generated file, e.g. `#pikku/pikku-bootstrap.gen.js`, is not a
  // leaf and has no editorial entry to count against.
  if (!leaf || leaf.endsWith('.js')) return null
  return `#pikku/${leaf}`
}

const packageNameAt = (
  directory: string,
  cache: Map<string, string | null>
): string | null => {
  const cached = cache.get(directory)
  if (cached !== undefined) return cached
  let name: string | null = null
  const path = `${directory}${sep}package.json`
  if (existsSync(path)) {
    try {
      name =
        (JSON.parse(readFileSync(path, 'utf8')) as { name?: string }).name ??
        null
    } catch {
      name = null
    }
  }
  cache.set(directory, name)
  return name
}

/**
 * A label a person recognises: the workspace package a file belongs to, or the
 * top-level source directory it sits under when the project is one package.
 * The root package is skipped deliberately — naming it would label every file
 * in a single-package project identically.
 */
export const surfaceUsageArea = (
  fileName: string,
  rootDir: string,
  cache: Map<string, string | null>
): string => {
  let directory = dirname(fileName)
  while (directory.startsWith(rootDir) && directory !== rootDir) {
    const name = packageNameAt(directory, cache)
    if (name) return name
    directory = dirname(directory)
  }
  const [segment] = relative(rootDir, fileName).split(sep)
  return segment && segment !== basename(fileName) ? segment : basename(rootDir)
}

const namesOf = (
  clause: ts.NamedImportBindings | ts.NamedExportBindings | undefined
): string[] => {
  if (!clause) return []
  if (ts.isNamedImports(clause) || ts.isNamedExports(clause)) {
    return clause.elements.map(
      (element) => (element.propertyName ?? element.name).text
    )
  }
  return []
}

/**
 * Counts the `#pikku/*` imports of one file into `into`. Only the file's own
 * top-level statements are looked at — an import declaration can appear nowhere
 * else — so this costs a single pass over the statement list and retains
 * nothing.
 */
export const accumulateSurfaceUsage = (
  sourceFile: ts.SourceFile,
  area: string,
  into: SurfaceUsageCounts
): void => {
  for (const statement of sourceFile.statements) {
    let specifier: ts.Expression | undefined
    let names: string[] = []

    if (ts.isImportDeclaration(statement)) {
      specifier = statement.moduleSpecifier
      names = namesOf(statement.importClause?.namedBindings)
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      specifier = statement.moduleSpecifier
      names = namesOf(statement.exportClause)
    }

    if (!specifier || names.length === 0 || !ts.isStringLiteral(specifier)) {
      continue
    }
    const leaf = leafSpecifierOf(specifier.text)
    if (!leaf) continue

    const symbols = (into[leaf] ??= {})
    for (const name of names) {
      const usage = (symbols[name] ??= { imports: 0, seenIn: [] })
      usage.imports += 1
      if (!usage.seenIn.includes(area)) usage.seenIn.push(area)
    }
  }
}
