import { describe, test } from 'node:test'
import assert from 'node:assert'
import { resolveAIMiddleware } from './middleware.js'
import { getInitialInspectorState } from '../inspector.js'
import * as ts from 'typescript'

function createSourceFile(code: string): ts.SourceFile {
  return ts.createSourceFile('test.ts', code, ts.ScriptTarget.ESNext, true)
}

function getObjectLiteral(
  sourceFile: ts.SourceFile
): ts.ObjectLiteralExpression {
  let result: ts.ObjectLiteralExpression | undefined
  ts.forEachChild(sourceFile, function visit(node) {
    if (ts.isObjectLiteralExpression(node) && !result) {
      result = node
    }
    ts.forEachChild(node, visit)
  })
  if (!result) throw new Error('No object literal found')
  return result
}

function createMockChecker(): ts.TypeChecker {
  return {} as any
}

describe('resolveAIMiddleware', () => {
  test('should return undefined when no aiMiddleware property exists', () => {
    const state = getInitialInspectorState('/test')
    const src = createSourceFile('const x = { name: "test" }')
    const obj = getObjectLiteral(src)
    const checker = createMockChecker()

    const result = resolveAIMiddleware(state, obj, checker)

    assert.strictEqual(result, undefined)
  })

  test('should return undefined when aiMiddleware array is empty', () => {
    const state = getInitialInspectorState('/test')
    const src = createSourceFile('const x = { aiMiddleware: [] }')
    const obj = getObjectLiteral(src)
    const checker = createMockChecker()

    const result = resolveAIMiddleware(state, obj, checker)

    assert.strictEqual(result, undefined)
  })

  test('should resolve aiMiddleware identifiers as wire metadata', () => {
    const state = getInitialInspectorState('/test')
    state.aiMiddleware.definitions['myAIMW'] = {
      services: { optimized: true, services: ['logger'] },
      sourceFile: '/test/middleware.ts',
      position: 0,
      exportedName: 'myAIMW',
    }

    const code = 'const x = { aiMiddleware: [myAIMW] }'
    const program = ts.createProgram({
      rootNames: ['test.ts'],
      options: { target: ts.ScriptTarget.ESNext },
      host: {
        ...ts.createCompilerHost({}),
        getSourceFile: (name) => {
          if (name === 'test.ts')
            return ts.createSourceFile(name, code, ts.ScriptTarget.ESNext, true)
          return undefined
        },
        fileExists: (name) => name === 'test.ts',
        readFile: (name) => (name === 'test.ts' ? code : undefined),
      },
    })
    const checker = program.getTypeChecker()
    const sourceFile = program.getSourceFile('test.ts')!
    const obj = getObjectLiteral(sourceFile)

    const result = resolveAIMiddleware(state, obj, checker)

    assert.ok(result)
    assert.strictEqual(result.length, 1)
    assert.deepStrictEqual(result[0], {
      type: 'wire',
      name: 'myAIMW',
      inline: false,
    })
  })

  test('should resolve multiple aiMiddleware entries', () => {
    const state = getInitialInspectorState('/test')
    state.aiMiddleware.definitions['firstMW'] = {
      services: { optimized: true, services: ['logger'] },
      sourceFile: '/test/middleware.ts',
      position: 0,
      exportedName: 'firstMW',
    }
    state.aiMiddleware.definitions['secondMW'] = {
      services: { optimized: true, services: [] },
      sourceFile: '/test/middleware.ts',
      position: 100,
      exportedName: 'secondMW',
    }

    const code = 'const x = { aiMiddleware: [firstMW, secondMW] }'
    const program = ts.createProgram({
      rootNames: ['test.ts'],
      options: { target: ts.ScriptTarget.ESNext },
      host: {
        ...ts.createCompilerHost({}),
        getSourceFile: (name) => {
          if (name === 'test.ts')
            return ts.createSourceFile(name, code, ts.ScriptTarget.ESNext, true)
          return undefined
        },
        fileExists: (name) => name === 'test.ts',
        readFile: (name) => (name === 'test.ts' ? code : undefined),
      },
    })
    const checker = program.getTypeChecker()
    const sourceFile = program.getSourceFile('test.ts')!
    const obj = getObjectLiteral(sourceFile)

    const result = resolveAIMiddleware(state, obj, checker)

    assert.ok(result)
    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0].type, 'wire')
    assert.strictEqual((result[0] as any).name, 'firstMW')
    assert.strictEqual(result[1].type, 'wire')
    assert.strictEqual((result[1] as any).name, 'secondMW')
  })

  test('should mark inline aiMiddleware (null exportedName)', () => {
    const state = getInitialInspectorState('/test')
    state.aiMiddleware.definitions['inlineMW'] = {
      services: { optimized: true, services: [] },
      sourceFile: '/test/middleware.ts',
      position: 0,
      exportedName: null,
    }

    const code = 'const x = { aiMiddleware: [inlineMW] }'
    const program = ts.createProgram({
      rootNames: ['test.ts'],
      options: { target: ts.ScriptTarget.ESNext },
      host: {
        ...ts.createCompilerHost({}),
        getSourceFile: (name) => {
          if (name === 'test.ts')
            return ts.createSourceFile(name, code, ts.ScriptTarget.ESNext, true)
          return undefined
        },
        fileExists: (name) => name === 'test.ts',
        readFile: (name) => (name === 'test.ts' ? code : undefined),
      },
    })
    const checker = program.getTypeChecker()
    const sourceFile = program.getSourceFile('test.ts')!
    const obj = getObjectLiteral(sourceFile)

    const result = resolveAIMiddleware(state, obj, checker)

    assert.ok(result)
    assert.strictEqual(result.length, 1)
    assert.deepStrictEqual(result[0], {
      type: 'wire',
      name: 'inlineMW',
      inline: true,
    })
  })

  test('should handle aiMiddleware referencing unknown definitions', () => {
    const state = getInitialInspectorState('/test')

    const code = 'const x = { aiMiddleware: [unknownMW] }'
    const program = ts.createProgram({
      rootNames: ['test.ts'],
      options: { target: ts.ScriptTarget.ESNext },
      host: {
        ...ts.createCompilerHost({}),
        getSourceFile: (name) => {
          if (name === 'test.ts')
            return ts.createSourceFile(name, code, ts.ScriptTarget.ESNext, true)
          return undefined
        },
        fileExists: (name) => name === 'test.ts',
        readFile: (name) => (name === 'test.ts' ? code : undefined),
      },
    })
    const checker = program.getTypeChecker()
    const sourceFile = program.getSourceFile('test.ts')!
    const obj = getObjectLiteral(sourceFile)

    const result = resolveAIMiddleware(state, obj, checker)

    assert.ok(result)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].type, 'wire')
    assert.strictEqual((result[0] as any).name, 'unknownMW')
    assert.strictEqual((result[0] as any).inline, false)
  })
})
