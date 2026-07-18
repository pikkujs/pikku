import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'
import { ErrorCode } from '../error-codes.js'

function makeLogger(
  criticals: Array<{ code: string; message: string }>
): InspectorLogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: () => {},
    critical: (code, message) => criticals.push({ code, message }),
    hasCriticalErrors: () => criticals.length > 0,
  }
}

describe('validateWorkflowGraphAddons', () => {
  test('a graph node referencing graph: without @pikku/addon-graph wired raises PKU642', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-graph-addon-'))
    const stepFile = join(rootDir, 'my.steps.ts')
    const graphFile = join(rootDir, 'my.graph.ts')

    await writeFile(
      stepFile,
      [
        "import { pikkuSessionlessFunc } from '@pikku/core'",
        'export const notify = pikkuSessionlessFunc({ func: async () => ({ sent: true }) })',
      ].join('\n')
    )
    await writeFile(
      graphFile,
      [
        "import { pikkuWorkflowGraph } from '@pikku/core/workflow'",
        'export const myGraph = pikkuWorkflowGraph({',
        "  name: 'my-graph',",
        '  nodes: {',
        "    setFields: 'graph:editFields',",
        "    notify: 'notify',",
        '  },',
        "  config: { setFields: { next: 'notify' }, notify: {} },",
        '})',
      ].join('\n')
    )

    try {
      const criticals: Array<{ code: string; message: string }> = []
      await inspect(makeLogger(criticals), [stepFile, graphFile], { rootDir })
      const hit = criticals.find(
        (c) => c.code === ErrorCode.WORKFLOW_GRAPH_ADDON_NOT_WIRED
      )
      assert.ok(hit, 'expected a WORKFLOW_GRAPH_ADDON_NOT_WIRED critical')
      assert.match(hit!.message, /@pikku\/addon-graph is not wired/)
      assert.match(hit!.message, /scaffold/)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('a graph with only user RPCs raises no addon-graph critical', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-graph-addon-ok-'))
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
        "  nodes: { assess: 'assess', notify: 'notify' },",
        "  config: { assess: { next: 'notify' }, notify: {} },",
        '})',
      ].join('\n')
    )

    try {
      const criticals: Array<{ code: string; message: string }> = []
      await inspect(makeLogger(criticals), [stepFile, graphFile], { rootDir })
      const hit = criticals.find(
        (c) => c.code === ErrorCode.WORKFLOW_GRAPH_ADDON_NOT_WIRED
      )
      assert.equal(hit, undefined, 'no addon-graph critical expected')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
