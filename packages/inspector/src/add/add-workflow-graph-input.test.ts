import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

function makeLogger(): InspectorLogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: () => {},
    critical: () => {},
    hasCriticalErrors: () => false,
  }
}

describe('addWorkflowGraph — node input extraction', () => {
  test('`as const` and imported template() values survive into the serialized input', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-graph-input-'))
    const stepFile = join(rootDir, 'my.steps.ts')
    const graphFile = join(rootDir, 'my.graph.ts')

    await writeFile(
      stepFile,
      [
        "import { pikkuSessionlessFunc } from '@pikku/core'",
        'export const edit = pikkuSessionlessFunc({ func: async () => ({ ok: true }) })',
      ].join('\n')
    )

    await writeFile(
      graphFile,
      [
        "import { pikkuWorkflowGraph } from '@pikku/core/workflow'",
        "import { template } from '@pikku/core/workflow'",
        'export const myGraph = pikkuWorkflowGraph({',
        "  name: 'input-graph',",
        "  nodes: { edit: 'edit' },",
        '  config: {',
        '    edit: {',
        '      input: (ref) => ({',
        "        method: 'GET' as const,",
        '        operations: [',
        "          { field: 'product', operation: 'set' as const, value: 'widget' },",
        "          { field: 'email', operation: 'set' as const, value: ref('trigger', 'body.email') },",
        "          { field: 'greeting', operation: 'set' as const, value: template('Hi $0', [ref('trigger', 'body.name')]) },",
        '        ],',
        '      }),',
        '    },',
        '  },',
        '})',
      ].join('\n')
    )

    try {
      const state = await inspect(makeLogger(), [stepFile, graphFile], {
        rootDir,
      })
      const graph = state.workflows.graphMeta['input-graph']
      assert.ok(graph, 'graph meta should be registered')
      const input = (graph.nodes['edit'] as { input?: any }).input
      assert.ok(input, 'node input should be extracted')

      // Bug 1 — top-level `X as const` must not be dropped.
      assert.equal(input.method, 'GET', 'top-level `as const` value preserved')

      // Bug 1 — nested `as const` inside an array element must not be dropped.
      assert.equal(input.operations[0].operation, 'set')
      assert.equal(input.operations[0].value, 'widget')
      assert.equal(input.operations[1].operation, 'set')

      // ref() still works alongside the fix.
      assert.deepEqual(input.operations[1].value, {
        $ref: 'trigger',
        path: 'body.email',
      })

      // Bug 2 — imported template() (arrow has only `ref`, no 2nd param) preserved.
      assert.equal(input.operations[2].operation, 'set')
      assert.deepEqual(input.operations[2].value, {
        $template: {
          parts: ['Hi ', ''],
          expressions: [{ $ref: 'trigger', path: 'body.name' }],
        },
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
