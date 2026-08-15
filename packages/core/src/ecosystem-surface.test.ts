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
    if (specifier.startsWith('@pikku/core/ecosystem')) continue
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
 * The names that drive the runner rather than describe it: a wire's dispatch
 * entry point, the state it dispatches against, and the lifecycle around it.
 * An app reaches for these only in bootstrap code — `start.ts`, `server.ts`,
 * a Lambda handler — and there the app is standing in for a runtime adapter,
 * which is the ecosystem tier. Everything else an app writes goes through the
 * generated `#pikku` alias instead.
 */
const dispatchEntryPoints = new Set([
  'PikkuWorkflowService',
  'fetch',
  'fetchData',
  'pikkuServerLifecycle',
  'pikkuState',
  'rpcService',
  'runCLICommand',
  'runChannelConnect',
  'runChannelDisconnect',
  'runChannelMessage',
  'runLocalChannel',
  'runMCPPrompt',
  'runMCPResource',
  'runMCPTool',
  'runPikkuFunc',
  'runQueueJob',
  'runScheduledTask',
  'stopSingletonServices',
])

/**
 * `templates`, `e2e` and `verifiers` are apps, not packages, so they have no
 * `src` convention to walk — the bootstrap files sit wherever the runtime
 * wants them. Walking the tree root means skipping what an app accumulates:
 * installed dependencies, build output, and its own generated `.pikku`.
 */
const skipped = new Set(['node_modules', 'dist', '.pikku', '.next', 'build'])

const walkApp = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (skipped.has(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walkApp(path, out)
    else if (path.endsWith('.ts') || path.endsWith('.tsx')) out.push(path)
  }
  return out
}

const appTierSourceFiles = () => {
  const files: string[] = []
  for (const tree of ['templates', 'e2e', 'verifiers']) {
    walkApp(join(repoRoot, tree), files)
  }
  return files.filter((file) => !isGenerated(file))
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

  test('app bootstrap reaches dispatch entry points through ecosystem', () => {
    const offenders: string[] = []

    for (const file of appTierSourceFiles()) {
      for (const { specifier, line, names } of coreSpecifiers(file)) {
        const dispatch = names.filter((name) => dispatchEntryPoints.has(name))
        if (dispatch.length === 0) continue
        offenders.push(
          `${relative(repoRoot, file)}:${line}  ${dispatch.join(', ')}  from '${specifier}'`
        )
      }
    }

    assert.deepStrictEqual(
      offenders,
      [],
      `Bootstrap code that drives the runner is standing in for a runtime ` +
        `adapter, so it takes the same door: '@pikku/core/ecosystem/*'.\n` +
        `These raw subpaths are scheduled for deletion, and the name is ` +
        `already on the facade for its wire.\n\n` +
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
