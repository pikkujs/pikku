import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const here = dirname(fileURLToPath(import.meta.url))

const hasTopLevelAwait = (sf: ts.SourceFile): boolean => {
  let found = false
  const visit = (n: ts.Node) => {
    if (found || ts.isFunctionLike(n) || ts.isClassLike(n)) return
    if (
      n.kind === ts.SyntaxKind.AwaitExpression ||
      (ts.isForOfStatement(n) && n.awaitModifier)
    ) {
      found = true
      return
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

const relativeImports = (sf: ts.SourceFile): string[] =>
  sf.statements.flatMap((s) =>
    (ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) &&
    s.moduleSpecifier &&
    ts.isStringLiteral(s.moduleSpecifier) &&
    s.moduleSpecifier.text.startsWith('.') &&
    !(ts.isImportDeclaration(s) && s.importClause?.isTypeOnly) &&
    !(ts.isExportDeclaration(s) && s.isTypeOnly)
      ? [s.moduleSpecifier.text]
      : []
  )

const resolveTs = (from: string, spec: string): string | undefined => {
  const base = resolve(dirname(from), spec.replace(/\.js$/, ''))
  return [`${base}.ts`, resolve(base, 'index.ts')].find(existsSync)
}

describe('@pikku/cli addon entries', () => {
  // The Rust inspector evaluates an addon's schema files in QuickJS, and an
  // addon file that imports `@pikku/cli/addon-support*` drags this graph in.
  // A top-level `await` anywhere in it deadlocks the second schema file that
  // shares the module ("Error blocking on a promise resulted in a dead lock").
  test('no module reachable from addon-support has a top-level await', () => {
    const seen = new Set<string>()
    const offenders: string[] = []
    const queue = ['addon-support.ts', 'addon-support-validate.ts'].map((f) =>
      resolve(here, f)
    )
    while (queue.length > 0) {
      const file = queue.pop()!
      if (seen.has(file)) continue
      seen.add(file)
      const sf = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.ESNext,
        true
      )
      if (hasTopLevelAwait(sf)) offenders.push(file.slice(here.length + 1))
      for (const spec of relativeImports(sf)) {
        const next = resolveTs(file, spec)
        if (next) queue.push(next)
      }
    }
    assert.ok(seen.size > 20, `walked only ${seen.size} modules`)
    assert.deepEqual(offenders, [])
  })
})
