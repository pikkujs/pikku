import { test, describe } from 'node:test'
import * as assert from 'assert'
import ts from 'typescript'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Templates are the one tree that is copied verbatim into a user's project, so
 * whatever they import is what every new Pikku app starts life importing. The
 * app-developer surface is the generated `#pikku` alias; a relative path into
 * `.pikku` reaches the same file but teaches the wrong habit, and it breaks the
 * moment `create-pikku` moves the directory — which it does for StackBlitz,
 * where `.pikku` becomes `pikku-gen`.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const templatesDir = join(repoRoot, 'templates')
const skipped = new Set(['node_modules', 'dist', '.pikku', '.next', 'build'])

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (skipped.has(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (path.endsWith('.ts') || path.endsWith('.tsx')) out.push(path)
  }
  return out
}

/**
 * `.gen.*` and `.d.ts` files are CLI output rather than template source: what
 * they import is decided by the codegen serializers, not by the template.
 */
const isGenerated = (path: string) =>
  path.includes('.gen.') || path.endsWith('.d.ts')

const templateNames = () =>
  readdirSync(templatesDir).filter((name) =>
    existsSync(join(templatesDir, name, 'package.json'))
  )

const templateSourceFiles = (template: string) => {
  const dir = join(templatesDir, template)
  return walk(dir).filter((file) => !isGenerated(file))
}

/**
 * Parsed rather than grepped, so a `.pikku` path quoted inside a string
 * literal — a config default, a doc comment, a codegen fixture — is not
 * mistaken for an import the template actually makes.
 */
const generatedImports = (file: string) => {
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
    const specifier = moduleSpecifier.text
    if (!specifier.startsWith('.')) continue
    if (!/(^|\/)\.pikku\//.test(specifier)) continue
    const { line } = source.getLineAndCharacterOfPosition(
      statement.getStart(source)
    )
    found.push({ specifier, line: line + 1 })
  }
  return found
}

/**
 * Bun resolves a '#'-prefixed specifier as a Node subpath import and does not
 * apply tsconfig `paths` to it, so neither half of the alias reaches the
 * functions template next door: Node rejects the '../' imports target, and
 * `paths` is never consulted. Until the bun template takes a workspace
 * dependency on the functions template — which makes a bare specifier a legal
 * imports target — it has no alias mechanism and keeps the relative path.
 */
const withoutAlias = new Set(['bun'])

describe('templates ship the #pikku alias', () => {
  test('no template reaches generated output through a relative path', () => {
    const offenders: string[] = []

    for (const template of templateNames()) {
      if (withoutAlias.has(template)) continue
      for (const file of templateSourceFiles(template)) {
        for (const { specifier, line } of generatedImports(file)) {
          offenders.push(`${relative(repoRoot, file)}:${line}  ${specifier}`)
        }
      }
    }

    assert.deepStrictEqual(
      offenders,
      [],
      `Templates must reach generated output through the '#pikku' alias.\n` +
        `A relative path into '.pikku' is the specifier every scaffolded app ` +
        `would inherit, and it breaks when create-pikku relocates the ` +
        `directory.\n\n` +
        offenders.join('\n')
    )
  })

  /**
   * `paths` is what actually resolves the alias in a runtime template: it
   * points at the functions template next door, and tsx, tsc and the
   * inspector all consult it. The inspector in particular builds its own
   * program and inherits only baseUrl, paths, rootDirs and pathsBasePath —
   * it never sees an imports map.
   */
  test('every template using #pikku declares it in tsconfig paths', () => {
    const offenders: string[] = []

    for (const template of templateNames()) {
      const usesAlias = templateSourceFiles(template).some((file) =>
        /['"]#pikku\//.test(readFileSync(file, 'utf8'))
      )
      if (!usesAlias) continue

      const tsconfigPath = join(templatesDir, template, 'tsconfig.json')
      if (!existsSync(tsconfigPath)) {
        offenders.push(`templates/${template}/tsconfig.json  missing`)
        continue
      }
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'))
      if (!tsconfig.compilerOptions?.paths?.['#pikku/*']) {
        offenders.push(`templates/${template}/tsconfig.json  missing paths`)
      }
    }

    assert.deepStrictEqual(
      offenders,
      [],
      `A template that imports '#pikku/…' has to declare it in tsconfig ` +
        `'paths', which is what resolves it.\n\n` +
        offenders.join('\n')
    )
  })

  /**
   * Node rejects an internal-imports target that is not './'-relative or a
   * bare package specifier, so a '../' target throws ERR_INVALID_PACKAGE_TARGET
   * rather than resolving. A runtime template reaching the functions template
   * next door cannot express that as an imports map at all — it resolves
   * through `paths`, and declaring the map anyway only looks like it works,
   * because `paths` answers first.
   */
  test('no template declares an imports target Node will reject', () => {
    const offenders: string[] = []

    for (const template of templateNames()) {
      const pkg = JSON.parse(
        readFileSync(join(templatesDir, template, 'package.json'), 'utf8')
      )
      for (const [specifier, target] of Object.entries(pkg.imports ?? {})) {
        if (typeof target === 'string' && target.startsWith('../')) {
          offenders.push(
            `templates/${template}/package.json  ${specifier} -> ${target}`
          )
        }
      }
    }

    assert.deepStrictEqual(
      offenders,
      [],
      `An 'imports' target must start with './' or be a bare package ` +
        `specifier; '../' throws ERR_INVALID_PACKAGE_TARGET.\n\n` +
        offenders.join('\n')
    )
  })
})
