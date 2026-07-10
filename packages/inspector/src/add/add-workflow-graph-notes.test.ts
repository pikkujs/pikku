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

describe('addWorkflowGraph — notes extraction', () => {
  test('node-level and graph-level notes are carried into the serialized graph', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-graph-notes-'))
    const stepFile = join(rootDir, 'my.steps.ts')
    const graphFile = join(rootDir, 'my.graph.ts')

    await writeFile(
      stepFile,
      [
        "import { pikkuSessionlessFunc } from '@pikku/core'",
        'export const assess = pikkuSessionlessFunc({ func: async () => ({ ok: true }) })',
        'export const notify = pikkuSessionlessFunc({ func: async () => ({ sent: true }) })',
      ].join('\n')
    )

    await writeFile(
      graphFile,
      [
        "import { pikkuWorkflowGraph } from '@pikku/core/workflow'",
        'export const myGraph = pikkuWorkflowGraph({',
        "  name: 'my-graph',",
        "  notes: ['imported from n8n sticky note'],",
        '  nodes: {',
        "    assess: 'assess',",
        "    notify: 'notify',",
        '  },',
        '  config: {',
        "    assess: { next: 'notify', notes: 'STUB — generated from n8n node \"Assess\"' },",
        '    notify: {},',
        '  },',
        '})',
      ].join('\n')
    )

    try {
      const state = await inspect(makeLogger(), [stepFile, graphFile], {
        rootDir,
      })
      const graph = state.workflows.graphMeta['my-graph']
      assert.ok(graph, 'graph meta should be registered')
      assert.deepEqual(graph.notes, ['imported from n8n sticky note'])
      assert.equal(
        (graph.nodes['assess'] as { notes?: string }).notes,
        'STUB — generated from n8n node "Assess"'
      )
      assert.equal(
        (graph.nodes['notify'] as { notes?: string }).notes,
        undefined
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
