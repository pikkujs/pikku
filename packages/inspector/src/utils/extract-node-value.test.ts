import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import * as ts from 'typescript'
import { extractDescription } from './extract-node-value'

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

  test('returns null for non-literal description value without crashing', () => {
    const { checker, sourceFile } = createChecker(
      `const name = 'test'; const data = { description: name + ' addon' }`
    )
    const objs: ts.ObjectLiteralExpression[] = []
    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node)) objs.push(node)
      ts.forEachChild(node, visit)
    }
    ts.forEachChild(sourceFile, visit)
    const dataObj = objs[objs.length - 1]!
    assert.equal(extractDescription(dataObj, checker), null)
  })

  test('returns null for non-object node', () => {
    const { checker, sourceFile } = createChecker(`const x = 42`)
    assert.equal(extractDescription(sourceFile, checker), null)
  })
})
