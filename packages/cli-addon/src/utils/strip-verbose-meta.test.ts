import { describe, test } from 'node:test'
import assert from 'node:assert'
import { stripVerboseFields, hasVerboseFields } from './strip-verbose-meta.js'

describe('stripVerboseFields', () => {
  describe('function meta (record with pikkuFuncId)', () => {
    test('strips verbose fields from entries with pikkuFuncId', () => {
      const meta = {
        listTodos: {
          pikkuFuncId: 'listTodos',
          sessionless: true,
          inputSchemaName: 'ListInput',
          description: 'Lists todos',
          tags: ['read'],
          services: { optimized: true, services: ['todoStore'] },
          isDirectFunction: false,
        },
      }

      const result = stripVerboseFields(meta) as any
      assert.strictEqual(result.listTodos.pikkuFuncId, 'listTodos')
      assert.strictEqual(result.listTodos.sessionless, true)
      assert.strictEqual(result.listTodos.inputSchemaName, 'ListInput')
      assert.strictEqual(result.listTodos.description, undefined)
      assert.strictEqual(result.listTodos.tags, undefined)
      assert.strictEqual(result.listTodos.services, undefined)
      assert.strictEqual(result.listTodos.isDirectFunction, undefined)
    })

    test('strips sourceFile and exportedName from entries', () => {
      const meta = {
        myFunc: {
          pikkuFuncId: 'myFunc',
          sessionless: true,
          sourceFile: '/src/functions/my-func.ts',
          exportedName: 'myFunc',
          funcWrapper: 'pikkuSessionlessFunc',
        },
      }

      const result = stripVerboseFields(meta) as any
      assert.strictEqual(result.myFunc.pikkuFuncId, 'myFunc')
      assert.strictEqual(result.myFunc.sessionless, true)
      assert.strictEqual(result.myFunc.sourceFile, undefined)
      assert.strictEqual(result.myFunc.exportedName, undefined)
    })

    test('preserves middleware and permissions (not verbose)', () => {
      const meta = {
        myFunc: {
          pikkuFuncId: 'myFunc',
          middleware: [{ type: 'wire', name: 'auth' }],
          permissions: [{ type: 'wire', name: 'admin' }],
          description: 'should be stripped',
        },
      }

      const result = stripVerboseFields(meta) as any
      assert.deepStrictEqual(result.myFunc.middleware, [
        { type: 'wire', name: 'auth' },
      ])
      assert.deepStrictEqual(result.myFunc.permissions, [
        { type: 'wire', name: 'admin' },
      ])
      assert.strictEqual(result.myFunc.description, undefined)
    })
  })

  describe('agent meta (nested under agentsMeta key)', () => {
    test('does not strip agent entries (no pikkuFuncId)', () => {
      const meta = {
        agentsMeta: {
          todoAssistant: {
            name: 'todo-assistant',
            description: 'Manages todos',
            instructions: 'Help users',
            sourceFile: '/src/agents.ts',
            exportedName: 'todoAssistant',
          },
        },
      }

      const result = stripVerboseFields(meta) as any
      // Agent entries don't have pikkuFuncId, so they pass through unstripped
      assert.strictEqual(
        result.agentsMeta.todoAssistant.description,
        'Manages todos'
      )
      assert.strictEqual(
        result.agentsMeta.todoAssistant.sourceFile,
        '/src/agents.ts'
      )
    })
  })
})

describe('hasVerboseFields', () => {
  test('returns true when sourceFile is present', () => {
    const meta = {
      myFunc: {
        pikkuFuncId: 'myFunc',
        sourceFile: '/src/func.ts',
      },
    }
    assert.strictEqual(hasVerboseFields(meta), true)
  })

  test('returns true when exportedName is present', () => {
    const meta = {
      myFunc: {
        pikkuFuncId: 'myFunc',
        exportedName: 'myFunc',
      },
    }
    assert.strictEqual(hasVerboseFields(meta), true)
  })

  test('returns false when no verbose fields present', () => {
    const meta = {
      myFunc: {
        pikkuFuncId: 'myFunc',
        sessionless: true,
        inputSchemaName: 'Input',
      },
    }
    assert.strictEqual(hasVerboseFields(meta), false)
  })

  test('returns true when description is present', () => {
    const meta = {
      myFunc: {
        pikkuFuncId: 'myFunc',
        description: 'A function',
      },
    }
    assert.strictEqual(hasVerboseFields(meta), true)
  })
})
