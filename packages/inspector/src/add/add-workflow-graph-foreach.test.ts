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

async function inspectGraph(graphSource: string[], graphName: string) {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-graph-foreach-'))
  const stepFile = join(rootDir, 'my.steps.ts')
  const graphFile = join(rootDir, 'my.graph.ts')

  await writeFile(
    stepFile,
    [
      "import { pikkuSessionlessFunc } from '@pikku/core'",
      'export const listRows = pikkuSessionlessFunc({ func: async () => ({ rows: [] }) })',
      'export const postVideo = pikkuSessionlessFunc({ func: async () => ({ ok: true }) })',
    ].join('\n')
  )
  await writeFile(graphFile, graphSource.join('\n'))

  try {
    const state = await inspect(makeLogger(), [stepFile, graphFile], {
      rootDir,
    })
    const graph = state.workflows.graphMeta[graphName]
    assert.ok(graph, `graph meta '${graphName}' should be registered`)
    return graph
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('addWorkflowGraph — forEach extraction', () => {
  test('forEach node id and $item() lower into the serialized meta', async () => {
    const graph = await inspectGraph(
      [
        "import { pikkuWorkflowGraph } from '@pikku/core/workflow'",
        'export const myGraph = pikkuWorkflowGraph({',
        "  name: 'foreach-graph',",
        "  nodes: { listRows: 'listRows', postVideo: 'postVideo' },",
        '  config: {',
        "    listRows: { next: 'postVideo' },",
        '    postVideo: {',
        "      forEach: 'listRows',",
        '      input: (ref, template, $item) => ({',
        "        url: $item('URL VIDEO'),",
        '        whole: $item(),',
        "        listed: ref('listRows'),",
        '      }),',
        '    },',
        '  },',
        '})',
      ],
      'foreach-graph'
    )

    const node = graph.nodes['postVideo'] as any
    assert.deepEqual(node.forEach, { $ref: 'listRows' })
    assert.equal(node.mode, undefined)
    assert.deepEqual(node.input, {
      url: { $ref: '$item', path: 'URL VIDEO' },
      whole: { $ref: '$item', path: undefined },
      listed: { $ref: 'listRows', path: undefined },
    })
  })

  test('forEach accepts a (ref) callback with a path, plus a sequential mode', async () => {
    const graph = await inspectGraph(
      [
        "import { pikkuWorkflowGraph } from '@pikku/core/workflow'",
        'export const myGraph = pikkuWorkflowGraph({',
        "  name: 'foreach-callback-graph',",
        "  nodes: { listRows: 'listRows', postVideo: 'postVideo' },",
        '  config: {',
        "    listRows: { next: 'postVideo' },",
        '    postVideo: {',
        "      forEach: (ref) => ref('listRows', 'rows'),",
        "      mode: 'sequential',",
        "      input: (ref, template, $item) => ({ url: $item('URL') }),",
        '    },',
        '  },',
        '})',
      ],
      'foreach-callback-graph'
    )

    const node = graph.nodes['postVideo'] as any
    assert.deepEqual(node.forEach, { $ref: 'listRows', path: 'rows' })
    assert.equal(node.mode, 'sequential')
  })

  test('an existing (ref) => ... node keeps its exact input and gains no forEach', async () => {
    const graph = await inspectGraph(
      [
        "import { pikkuWorkflowGraph } from '@pikku/core/workflow'",
        "import { template } from '@pikku/core/workflow'",
        'export const myGraph = pikkuWorkflowGraph({',
        "  name: 'plain-graph',",
        "  nodes: { listRows: 'listRows', postVideo: 'postVideo' },",
        '  config: {',
        "    listRows: { next: 'postVideo' },",
        '    postVideo: {',
        '      input: (ref) => ({',
        "        rows: ref('listRows', 'rows'),",
        "        label: template('rows: $0', [ref('listRows', 'rows')]),",
        '      }),',
        '    },',
        '  },',
        '})',
      ],
      'plain-graph'
    )

    const node = graph.nodes['postVideo'] as any
    assert.equal(node.forEach, undefined)
    assert.equal(node.mode, undefined)
    assert.deepEqual(node.input, {
      rows: { $ref: 'listRows', path: 'rows' },
      label: {
        $template: {
          parts: ['rows: ', ''],
          expressions: [{ $ref: 'listRows', path: 'rows' }],
        },
      },
    })
  })

  test('an existing (ref, template) => ... node still resolves template from the 2nd param', async () => {
    const graph = await inspectGraph(
      [
        "import { pikkuWorkflowGraph } from '@pikku/core/workflow'",
        'export const myGraph = pikkuWorkflowGraph({',
        "  name: 'two-param-graph',",
        "  nodes: { listRows: 'listRows', postVideo: 'postVideo' },",
        '  config: {',
        "    listRows: { next: 'postVideo' },",
        '    postVideo: {',
        '      input: (ref, template) => ({',
        "        label: template('rows: $0', [ref('listRows', 'rows')]),",
        '      }),',
        '    },',
        '  },',
        '})',
      ],
      'two-param-graph'
    )

    const node = graph.nodes['postVideo'] as any
    assert.equal(node.forEach, undefined)
    assert.deepEqual(node.input, {
      label: {
        $template: {
          parts: ['rows: ', ''],
          expressions: [{ $ref: 'listRows', path: 'rows' }],
        },
      },
    })
  })
})
