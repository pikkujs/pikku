import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import * as ts from 'typescript'

import { detectSchemaVendorOrError } from './detect-schema-vendor.js'

let projectDir: string
let program: ts.Program
let checker: ts.TypeChecker
let sourceFile: ts.SourceFile

const criticals: string[] = []
const logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  critical(_code: unknown, message: string) {
    criticals.push(message)
  },
} as any

const initializerIdentifier = (name: string): ts.Identifier => {
  let found: ts.Identifier | undefined
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      ts.isIdentifier(node.initializer)
    ) {
      found = node.initializer
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.ok(found, `no identifier initializer found for '${name}'`)
  return found
}

before(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'pikku-schema-vendor-'))
  mkdirSync(join(projectDir, 'src'))
  writeFileSync(
    join(projectDir, 'src', 'schemas.ts'),
    [
      // Imported from a file that does not exist — exactly what a schema built
      // from an ungenerated '.pikku/db/zod.gen.ts' looks like to the checker.
      `import { UngeneratedSchema } from './not-written-yet.js'`,
      `export const unresolved = UngeneratedSchema`,
      `const plainObject = { a: 1 }`,
      `export const resolvedButNotASchema = plainObject`,
      '',
    ].join('\n')
  )

  program = ts.createProgram([join(projectDir, 'src', 'schemas.ts')], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  })
  checker = program.getTypeChecker()
  sourceFile = program.getSourceFile(join(projectDir, 'src', 'schemas.ts'))!
})

after(() => {
  rmSync(projectDir, { recursive: true, force: true })
})

describe('detectSchemaVendorOrError', () => {
  test('reports a type the checker could not resolve as a resolution failure', () => {
    criticals.length = 0

    const vendor = detectSchemaVendorOrError(
      initializerIdentifier('unresolved'),
      checker,
      logger,
      `Function 'createTodo' input`,
      'src/schemas.ts'
    )

    assert.equal(vendor, undefined)
    assert.equal(criticals.length, 1)
    const [message] = criticals
    assert.match(message, /could not be TYPED/)
    assert.match(message, /UngeneratedSchema/)
    assert.match(message, /pikku db generate/)
    // The unactionable advice must NOT be given for a type that simply failed
    // to resolve — the schema may well already be zod.
    assert.doesNotMatch(
      message,
      /Ensure your schema is imported from a supported validation library/
    )
  })

  test('still reports a resolvable non-vendor type as an unsupported library', () => {
    criticals.length = 0

    const vendor = detectSchemaVendorOrError(
      initializerIdentifier('resolvedButNotASchema'),
      checker,
      logger,
      `Function 'createTodo' input`,
      'src/schemas.ts'
    )

    assert.equal(vendor, undefined)
    assert.equal(criticals.length, 1)
    const [message] = criticals
    assert.match(
      message,
      /Ensure your schema is imported from a supported validation library/
    )
    assert.doesNotMatch(message, /could not be TYPED/)
  })
})
