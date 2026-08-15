import { test, describe } from 'node:test'
import * as assert from 'assert'
import ts from 'typescript'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `@pikku/core` exports two doors onto the same modules: the curated
 * `ecosystem/*` facades, and the raw internal barrels (`./http` maps straight
 * to `dist/wirings/http/index.js`). Everything that extends Pikku rather than
 * builds on it — runtime adapters, services, addons, the CLI, the inspector
 * and the console — is the ecosystem tier. It gets the second door closed on
 * it in a later breaking change, and until then nothing should drift back onto
 * it.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const ecosystemTiers = [
  'packages/runtimes',
  'packages/services',
  'packages/addon',
]
const ecosystemPackages = [
  'packages/cli',
  'packages/console',
  'packages/inspector',
]

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (path.endsWith('.ts') || path.endsWith('.tsx')) out.push(path)
  }
  return out
}

/**
 * `.gen.*` and `.d.ts` files under these trees are CLI output, not hand-written
 * source: what they import is decided by the codegen templates, which serve the
 * app tier and are migrating to the `#pikku` alias separately.
 */
const isGenerated = (path: string) =>
  path.includes('.gen.') || path.endsWith('.d.ts')

const tierSourceFiles = () => {
  const files: string[] = []
  const srcDirs: string[] = []
  for (const tier of ecosystemTiers) {
    const tierDir = join(repoRoot, tier)
    for (const pkg of readdirSync(tierDir)) {
      srcDirs.push(join(tierDir, pkg, 'src'))
    }
  }
  for (const pkg of ecosystemPackages) srcDirs.push(join(repoRoot, pkg, 'src'))
  for (const src of srcDirs) {
    try {
      if (!statSync(src).isDirectory()) continue
    } catch {
      continue
    }
    walk(src, files)
  }
  return files.filter((file) => !isGenerated(file))
}

/**
 * Parsed rather than grepped: `code-edit.service.test.ts` holds function
 * sources as template literals, and those `import … from '@pikku/core'` lines
 * are fixture text describing a user's file, not imports this package makes.
 */
const coreSpecifiers = (file: string) => {
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
    if (specifier !== '@pikku/core' && !specifier.startsWith('@pikku/core/')) {
      continue
    }
    if (specifier.startsWith('@pikku/core/ecosystem')) continue
    const { line } = source.getLineAndCharacterOfPosition(
      statement.getStart(source)
    )
    found.push({ specifier, line: line + 1 })
  }
  return found
}

describe('ecosystem surface', () => {
  test('the ecosystem tier imports core only through ecosystem', () => {
    const offenders: string[] = []

    for (const file of tierSourceFiles()) {
      for (const { specifier, line } of coreSpecifiers(file)) {
        offenders.push(`${relative(repoRoot, file)}:${line}  ${specifier}`)
      }
    }

    assert.deepStrictEqual(
      offenders,
      [],
      `Everything that extends Pikku must import core through ` +
        `'@pikku/core/ecosystem/*'.\n` +
        `Reaching a raw subpath pulls in an internal barrel that is scheduled ` +
        `for deletion. If the name you need is missing from a facade, add it ` +
        `there — that is the deliberate act of making it public.\n\n` +
        offenders.join('\n')
    )
  })

  test('every ecosystem facade resolves', async () => {
    const facades = walk(join(repoRoot, 'packages/core/src/ecosystem'))
      .filter((f) => !f.endsWith('.test.ts'))
      .map((f) =>
        relative(join(repoRoot, 'packages/core/src/ecosystem'), f).replace(
          /\.ts$/,
          '.js'
        )
      )

    assert.ok(facades.length > 0, 'expected ecosystem facades to exist')

    for (const facade of facades) {
      await assert.doesNotReject(
        () => import(`./ecosystem/${facade}`),
        `ecosystem/${facade} failed to load`
      )
    }
  })
})
