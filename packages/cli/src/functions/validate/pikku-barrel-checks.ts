import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import ts from 'typescript'
import type { ValidateFinding } from './persona-checks.js'

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.pikku',
  '.pikku-runtime',
  'coverage',
  '.next',
  '.yarn',
])

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts']

/**
 * `.gen.*` and `.d.ts` are the generator's own output — what they import is
 * decided by the codegen templates, not by the project.
 */
const isGenerated = (path: string) =>
  path.includes('.gen.') || path.endsWith('.d.ts')

/**
 * The specifiers that reach the retired re-export hub: the bare namespace, and
 * the hub as a deep file. Every other `#pikku/*` is a leaf or a generated
 * client and resolves to exactly what it names.
 */
const isBarrel = (specifier: string) =>
  specifier === '#pikku' || /^#pikku\/pikku-types\.gen(\.js)?$/.test(specifier)

/**
 * Parsed rather than grepped: a project's own codegen templates hold the
 * specifiers they emit inside template literals, and those are output text
 * rather than imports the file itself makes.
 */
const barrelImports = (file: string, content: string): string[] => {
  const source = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true
  )
  const found: string[] = []
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) &&
      !ts.isExportDeclaration(statement)
    ) {
      continue
    }
    const moduleSpecifier = statement.moduleSpecifier
    if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) continue
    if (isBarrel(moduleSpecifier.text)) found.push(moduleSpecifier.text)
  }
  return found
}

const collectSources = async (
  dir: string,
  out: string[] = []
): Promise<string[]> => {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      await collectSources(path, out)
    } else if (
      SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext)) &&
      !isGenerated(entry.name)
    ) {
      out.push(path)
    }
  }
  return out
}

/**
 * `#pikku` is the app tier's only door onto Pikku, and it is a namespace rather
 * than a module: `#pikku/http`, `#pikku/workflow`, one subpath per wiring.
 *
 * The bare specifier used to resolve to a hub that re-exported every wiring
 * leaf with `export *`, undoing the split the leaves exist for. Neither
 * consumer could drop the result again: bundlers keep `export *` chains unless
 * the package declares `sideEffects`, and Node and tsx do not tree-shake at
 * all — so an app with no queues still executed `@pikku/core/queue` at boot.
 */
export const runPikkuBarrelChecks = async (
  dir: string
): Promise<ValidateFinding[]> => {
  const findings: ValidateFinding[] = []

  for (const file of await collectSources(dir)) {
    const content = await readFile(file, 'utf8')
    if (!content.includes('#pikku')) continue
    for (const specifier of barrelImports(file, content)) {
      findings.push({
        id: 'pikku-barrel-import',
        severity: 'error',
        message: `${relative(dir, file)} imports '${specifier}' — the app tier reaches Pikku through one subpath per wiring, and a barrel pulls every wiring's core dependencies into the module graph`,
        path: file,
        fixHint:
          "Import from the leaf the name belongs to — '#pikku/function' for pikkuFunc, '#pikku/http' for wireHTTP, '#pikku/workflow' for workflow wiring",
      })
    }
  }

  return findings
}
