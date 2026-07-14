import { describe, test } from 'node:test'
import assert from 'node:assert'
import * as ts from 'typescript'

import { resolveWorkflowReferences } from './add-ai-agent.js'
import type { InspectorLogger } from '../types.js'

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

function createLogger(): {
  logger: InspectorLogger
  criticals: Array<{ code: unknown; message: string }>
} {
  const criticals: Array<{ code: unknown; message: string }> = []
  const logger = {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
    diagnostic: () => {},
    critical: (code: unknown, message: string) =>
      criticals.push({ code, message }),
    hasCriticalErrors: () => criticals.length > 0,
  } as unknown as InspectorLogger
  return { logger, criticals }
}

describe('resolveWorkflowReferences', () => {
  test('returns null when no workflows property exists', () => {
    const obj = getObjectLiteral(createSourceFile('const x = { name: "a" }'))
    const { logger } = createLogger()
    assert.strictEqual(
      resolveWorkflowReferences(obj, {} as any, 'a', logger),
      null
    )
  })

  test('returns null for an empty workflows array', () => {
    const obj = getObjectLiteral(
      createSourceFile('const x = { workflows: [] }')
    )
    const { logger } = createLogger()
    assert.strictEqual(
      resolveWorkflowReferences(obj, {} as any, 'a', logger),
      null
    )
  })

  test('resolves ref() and workflow() string-literal references', () => {
    const obj = getObjectLiteral(
      createSourceFile(
        `const x = { workflows: [ref('buildReport'), workflow('country_capitals')] }`
      )
    )
    const { logger, criticals } = createLogger()
    const result = resolveWorkflowReferences(obj, {} as any, 'planner', logger)
    assert.deepStrictEqual(result, ['buildReport', 'country_capitals'])
    assert.strictEqual(criticals.length, 0)
  })

  test('flags a raw string literal as a critical error', () => {
    const obj = getObjectLiteral(
      createSourceFile(`const x = { workflows: ['buildReport'] }`)
    )
    const { logger, criticals } = createLogger()
    const result = resolveWorkflowReferences(obj, {} as any, 'planner', logger)
    assert.strictEqual(result, null)
    assert.strictEqual(criticals.length, 1)
    assert.match(criticals[0].message, /string literal/)
  })
})
