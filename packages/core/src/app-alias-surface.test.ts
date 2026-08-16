import { test, describe } from 'node:test'
import * as assert from 'assert'
import ts from 'typescript'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The generated `#pikku` alias is the app developer's public API. An app
 * reaching past it into `@pikku/core` is the smell this file measures: the
 * alias is typed against that app's own functions, so a name pulled from core
 * directly is one the app is holding untyped and one the CLI cannot evolve.
 *
 * The trees below are apps rather than packages, so they have no `src`
 * convention to walk — bootstrap and test files sit wherever the runtime wants
 * them. Walking each tree root means skipping what an app accumulates:
 * installed dependencies, build output, and its own generated `.pikku`.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const appTrees = ['templates', 'e2e', 'verifiers']
const skipped = new Set(['node_modules', 'dist', '.next', 'build'])

/**
 * `outDir` is a project's own setting, so the generated tree is not always
 * `.pikku` — the treeshake verifier writes one output tree per scenario under
 * `.pikku-shake`. Matching the prefix keeps a leaf's generated `index.ts`, which
 * carries no `.gen.` in its name, from reading as hand-written app code.
 */
const isGeneratedTree = (entry: string) => entry.startsWith('.pikku')

const walkApp = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (skipped.has(entry) || isGeneratedTree(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walkApp(path, out)
    else if (path.endsWith('.ts') || path.endsWith('.tsx')) out.push(path)
  }
  return out
}

/**
 * `.gen.*` and `.d.ts` files are CLI output, not hand-written source: what they
 * import is decided by the codegen templates, which are the thing that writes
 * the alias in the first place.
 */
const isGenerated = (path: string) =>
  path.includes('.gen.') || path.endsWith('.d.ts')

const appSourceFiles = () =>
  appTrees
    .flatMap((tree) => walkApp(join(repoRoot, tree)))
    .filter((file) => !isGenerated(file))

/**
 * Parsed rather than grepped: a step body held as a template literal is fixture
 * text describing a user's file, not an import the app itself makes.
 */
const coreImports = (file: string) => {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  )
  const found: { specifier: string; line: number; names: string[] }[] = []
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) &&
      !ts.isExportDeclaration(statement)
    ) {
      continue
    }
    const moduleSpecifier = statement.moduleSpecifier
    if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) continue
    const specifier = moduleSpecifier.text
    if (specifier !== '@pikku/core' && !specifier.startsWith('@pikku/core/')) {
      continue
    }
    const { line } = source.getLineAndCharacterOfPosition(
      statement.getStart(source)
    )
    const clause = ts.isImportDeclaration(statement)
      ? statement.importClause?.namedBindings
      : statement.exportClause
    const names =
      clause && (ts.isNamedImports(clause) || ts.isNamedExports(clause))
        ? clause.elements.map((element) => element.name.text)
        : []
    found.push({ specifier, line: line + 1, names })
  }
  return found
}

/**
 * The scenario and persona surfaces are test-only names — actors, cookie jars,
 * polling helpers, the typed personas an app declares. They are app code, but a
 * distinct surface from wiring, so they reach the app through their own
 * sub-entry rather than crowding the main hub.
 */
const scenarioSubpaths = new Set(['@pikku/core/scenario', '@pikku/core/persona'])

/**
 * A relative path into the generated scenario barrel reaches the same file the
 * alias does, so it compiles — and then hard-codes how far the app file sits
 * from `outDir`. Moving either end breaks it, and the CLI has no way to see
 * that it is depended upon.
 */
const relativeIntoScenarioBarrel = (file: string) => {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  )
  const found: { specifier: string; line: number }[] = []
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) &&
      !ts.isExportDeclaration(statement)
    ) {
      continue
    }
    const moduleSpecifier = statement.moduleSpecifier
    if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) continue
    if (!moduleSpecifier.text.startsWith('.')) continue
    if (!/\/pikku-scenario-types\.gen\.js$/.test(moduleSpecifier.text)) continue
    const { line } = source.getLineAndCharacterOfPosition(
      statement.getStart(source)
    )
    found.push({ specifier: moduleSpecifier.text, line: line + 1 })
  }
  return found
}

describe('the #pikku alias is the app surface', () => {
  test('scenario code reaches the test surface through #pikku/scenario', () => {
    const offenders: string[] = []

    for (const file of appSourceFiles()) {
      for (const { specifier, line, names } of coreImports(file)) {
        if (!scenarioSubpaths.has(specifier)) continue
        offenders.push(
          `${relative(repoRoot, file)}:${line}  ${names.join(', ')}  from '${specifier}'`
        )
      }
    }

    assert.deepStrictEqual(
      offenders,
      [],
      `Scenario and persona names come from the generated ` +
        `'#pikku/scenario' entry, which is typed against this app's own ` +
        `personas and steps.\n` +
        `Reaching '@pikku/core/scenario' or '@pikku/core/persona' directly ` +
        `gets the untyped shape, from a subpath scheduled for deletion.\n\n` +
        offenders.join('\n')
    )
  })

  test('the scenario barrel is reached through the alias, not a relative path', () => {
    const offenders: string[] = []

    for (const file of appSourceFiles()) {
      for (const { specifier, line } of relativeIntoScenarioBarrel(file)) {
        offenders.push(`${relative(repoRoot, file)}:${line}  '${specifier}'`)
      }
    }

    assert.deepStrictEqual(
      offenders,
      [],
      `The generated scenario barrel is reached through '#pikku/scenario', ` +
        `which the app's own 'imports' map points at.\n` +
        `A relative path hard-codes the distance from the file to 'outDir', ` +
        `so moving either end breaks it silently.\n\n` +
        offenders.join('\n')
    )
  })
})
