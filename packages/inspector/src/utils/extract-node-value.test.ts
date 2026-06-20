import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import * as ts from 'typescript'
import { extractDescription, extractStringLiteral } from './extract-node-value'

const createChecker = (source: string) => {
  const sourceFile = ts.createSourceFile(
    'test.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const host = ts.createCompilerHost({})
  const originalGetSourceFile = host.getSourceFile
  host.getSourceFile = (fileName, target) => {
    if (fileName === 'test.ts') return sourceFile
    return originalGetSourceFile.call(host, fileName, target)
  }
  const program = ts.createProgram(['test.ts'], {}, host)
  return { checker: program.getTypeChecker(), sourceFile }
}

const findObjectLiteral = (
  node: ts.Node
): ts.ObjectLiteralExpression | undefined => {
  if (ts.isObjectLiteralExpression(node)) return node
  let result: ts.ObjectLiteralExpression | undefined
  ts.forEachChild(node, (child) => {
    if (!result) result = findObjectLiteral(child)
  })
  return result
}

describe('extractDescription', () => {
  test('returns null when node is undefined', () => {
    const { checker } = createChecker('')
    assert.equal(extractDescription(undefined, checker), null)
  })

  test('extracts string literal description', () => {
    const { checker, sourceFile } = createChecker(
      `const opts = { description: 'my step' }`
    )
    const obj = findObjectLiteral(sourceFile)!
    assert.equal(extractDescription(obj, checker), 'my step')
  })

  test('extracts concatenated string literals in description', () => {
    const { checker, sourceFile } = createChecker(
      `const data = { description: 'line one ' + 'line two' }`
    )
    const obj = findObjectLiteral(sourceFile)!
    assert.equal(extractDescription(obj, checker), 'line one line two')
  })

  test('extracts deeply nested concatenation in description', () => {
    const { checker, sourceFile } = createChecker(
      `const data = { description: 'a' + 'b' + 'c' }`
    )
    const obj = findObjectLiteral(sourceFile)!
    assert.equal(extractDescription(obj, checker), 'abc')
  })

  test('returns null for non-object node', () => {
    const { checker, sourceFile } = createChecker(`const x = 42`)
    assert.equal(extractDescription(sourceFile, checker), null)
  })
})

describe('extractStringLiteral — concatenation/template symmetry', () => {
  const findInitializer = (node: ts.Node): ts.Expression | undefined => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      return node.initializer
    }
    let result: ts.Expression | undefined
    ts.forEachChild(node, (child) => {
      if (!result) result = findInitializer(child)
    })
    return result
  }

  test('a `+` operand that cannot be statically resolved becomes a ${...} placeholder', () => {
    const { checker, sourceFile } = createChecker(
      `const x = 'Enrich event ' + (event.id ?? event.name)`
    )
    const init = findInitializer(sourceFile)!
    assert.equal(
      extractStringLiteral(init, checker),
      'Enrich event ${event.id ?? event.name}'
    )
  })

  test('`+` concatenation and template literal produce the same display string', () => {
    const concat = createChecker(
      `const x = 'Enrich event ' + (event.id ?? event.name)`
    )
    const template = createChecker(
      'const x = `Enrich event ${event.id ?? event.name}`'
    )
    const concatValue = extractStringLiteral(
      findInitializer(concat.sourceFile)!,
      concat.checker
    )
    const templateValue = extractStringLiteral(
      findInitializer(template.sourceFile)!,
      template.checker
    )
    assert.equal(concatValue, templateValue)
  })

  test('still resolves fully-static concatenation exactly', () => {
    const { checker, sourceFile } = createChecker(`const x = 'a' + 'b' + 'c'`)
    const init = findInitializer(sourceFile)!
    assert.equal(extractStringLiteral(init, checker), 'abc')
  })
})
