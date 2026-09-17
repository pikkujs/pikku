import { describe, test } from 'node:test'
import assert from 'node:assert'
import * as ts from 'typescript'

import {
  resolveProviderOptions,
  resolveWorkflowReferences,
} from './add-agent.js'
import type { InspectorLogger } from '../types.js'
import { ErrorCode } from '../error-codes.js'

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
  diagnostics: Array<{ severity: string; code: unknown; message: string }>
} {
  const criticals: Array<{ code: unknown; message: string }> = []
  const diagnostics: Array<{
    severity: string
    code: unknown
    message: string
  }> = []
  const logger = {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
    diagnostic: (diagnostic: {
      severity: string
      code: unknown
      message: string
    }) => diagnostics.push(diagnostic),
    critical: (code: unknown, message: string) =>
      criticals.push({ code, message }),
    hasCriticalErrors: () => criticals.length > 0,
  } as unknown as InspectorLogger
  return { logger, criticals, diagnostics }
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

describe('resolveProviderOptions', () => {
  test('returns null when no providerOptions property exists', () => {
    const obj = getObjectLiteral(createSourceFile('const x = { name: "a" }'))
    const { logger, diagnostics } = createLogger()
    assert.strictEqual(resolveProviderOptions(obj, 'a', logger), null)
    assert.strictEqual(diagnostics.length, 0)
  })

  test('reads the per-provider options an agent declares', () => {
    const obj = getObjectLiteral(
      createSourceFile(
        `const x = { providerOptions: { openai: { reasoningEffort: 'low' } } }`
      )
    )
    const { logger, diagnostics } = createLogger()
    assert.deepStrictEqual(resolveProviderOptions(obj, 'assistant', logger), {
      openai: { reasoningEffort: 'low' },
    })
    assert.strictEqual(diagnostics.length, 0)
  })

  test('reads numbers, booleans, null, arrays and nesting', () => {
    const obj = getObjectLiteral(
      createSourceFile(
        `const x = { providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 1024 }, cache: true, stop: ['END'], seed: -1, unset: null } } }`
      )
    )
    const { logger } = createLogger()
    assert.deepStrictEqual(resolveProviderOptions(obj, 'assistant', logger), {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 1024 },
        cache: true,
        stop: ['END'],
        seed: -1,
        unset: null,
      },
    })
  })

  test('reads through an `as const`', () => {
    const obj = getObjectLiteral(
      createSourceFile(
        `const x = { providerOptions: { openai: { reasoningEffort: 'low' } } as const }`
      )
    )
    const { logger } = createLogger()
    assert.deepStrictEqual(resolveProviderOptions(obj, 'assistant', logger), {
      openai: { reasoningEffort: 'low' },
    })
  })

  test('reports a computed value instead of dropping it silently', () => {
    const obj = getObjectLiteral(
      createSourceFile(`const x = { providerOptions: buildOptions() }`)
    )
    const { logger, diagnostics } = createLogger()
    assert.strictEqual(resolveProviderOptions(obj, 'assistant', logger), null)
    assert.strictEqual(diagnostics.length, 1)
    assert.strictEqual(diagnostics[0]!.severity, 'warn')
    assert.strictEqual(
      diagnostics[0]!.code,
      ErrorCode.AGENT_PROVIDER_OPTIONS_UNREADABLE
    )
    assert.match(diagnostics[0]!.message, /assistant/)
  })

  test('refuses a half-readable object rather than reading part of it', () => {
    const obj = getObjectLiteral(
      createSourceFile(
        `const x = { providerOptions: { openai: { reasoningEffort: 'low', seed: someSeed } } }`
      )
    )
    const { logger, diagnostics } = createLogger()
    assert.strictEqual(resolveProviderOptions(obj, 'assistant', logger), null)
    assert.strictEqual(diagnostics.length, 1)
  })
})
