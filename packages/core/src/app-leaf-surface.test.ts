import { test, describe } from 'node:test'
import * as assert from 'assert'
import ts from 'typescript'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `#pikku` is the app tier's only door onto Pikku, and it is a namespace rather
 * than a module: `#pikku/http`, `#pikku/workflow`, one subpath per wiring.
 *
 * The bare specifier used to resolve to `.pikku/pikku-types.gen.ts`, which
 * re-exported all twelve wiring leaves with `export *` — undoing the split the
 * leaves exist for, each of which still says so in its own header ("HTTP-specific
 * type definitions for tree-shaking optimization"). Reaching that barrel put 33
 * distinct `@pikku/core` subpaths into the module graph, and neither of the two
 * consumers could drop them again: bundlers keep `export *` chains because the
 * app declares no `sideEffects`, and Node and tsx do not tree-shake at all, so
 * an app with no queues still executed `@pikku/core/queue` at boot.
 *
 * Deleting the barrel also turns the addon boundary from advice into a rule. An
 * addon's leaves are never generated, so `#pikku/http` fails to resolve at the
 * specifier rather than yielding "no exported member" from a hub that quietly
 * dropped the re-export.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * Membership is discovered, not listed: every directory holding a
 * `pikku.config.json` is a Pikku project, so a project added later arrives
 * guarded rather than invisible. Listing them by hand is how the ecosystem
 * guard reported green on four packages it had never scanned.
 */
const skipped = new Set([
  'node_modules',
  'dist',
  '.pikku',
  '.next',
  'build',
  '.git',
  'coverage',
])

const findProjects = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (skipped.has(entry)) continue
    const path = join(dir, entry)
    if (!statSync(path).isDirectory()) continue
    if (existsSync(join(path, 'pikku.config.json'))) out.push(path)
    findProjects(path, out)
  }
  return out
}

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
 * `.gen.*` and `.d.ts` are the generator's own output — what they import is
 * decided by the codegen templates, and `.pikku` is skipped outright.
 */
const isGenerated = (path: string) =>
  path.includes('.gen.') || path.endsWith('.d.ts')

const projectSourceFiles = (project: string) => {
  const files: string[] = []
  for (const entry of readdirSync(project)) {
    if (skipped.has(entry)) continue
    const path = join(project, entry)
    if (!statSync(path).isDirectory()) continue
    if (existsSync(join(path, 'pikku.config.json'))) continue
    walk(path, files)
  }
  return files.filter((file) => !isGenerated(file))
}

/**
 * Parsed rather than grepped: the CLI's serializers hold the specifiers they
 * emit inside template literals, and those are output text rather than imports
 * the CLI itself makes.
 */
const barrelSpecifiers = (file: string) => {
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
    const isBarrel =
      specifier === '#pikku' ||
      /^#pikku\/pikku-types\.gen(\.js)?$/.test(specifier)
    if (!isBarrel) continue
    const { line } = source.getLineAndCharacterOfPosition(
      statement.getStart(source)
    )
    found.push({ specifier, line: line + 1 })
  }
  return found
}

describe('app leaf surface', () => {
  test('no Pikku project reaches the app tier through a barrel', () => {
    const projects = findProjects(repoRoot)
    assert.ok(projects.length > 0, 'expected to discover Pikku projects')

    const offenders: string[] = []
    for (const project of projects) {
      for (const file of projectSourceFiles(project)) {
        for (const { specifier, line } of barrelSpecifiers(file)) {
          offenders.push(`${relative(repoRoot, file)}:${line}  ${specifier}`)
        }
      }
    }

    assert.deepStrictEqual(
      offenders,
      [],
      `The app tier reaches Pikku through one subpath per wiring — ` +
        `'#pikku/http', '#pikku/workflow', '#pikku/function'.\n` +
        `A barrel import pulls every wiring's core dependencies into the ` +
        `module graph, and nothing downstream can drop them again.\n\n` +
        offenders.join('\n')
    )
  })
})
