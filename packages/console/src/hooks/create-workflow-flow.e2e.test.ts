import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '@pikku/inspector'
import { createWorkflowFlow } from './create-workflow-flow.js'

const STEPS = [
  "import { pikkuSessionlessFunc } from '@pikku/core'",
  "export const chargeCard = pikkuSessionlessFunc({ func: async () => ({ id: 'c' }) })",
  "export const refundOrder = pikkuSessionlessFunc({ func: async () => ({ id: 'r' }) })",
  "export const shipOrder = pikkuSessionlessFunc({ func: async () => ({ id: 's' }) })",
].join('\n')

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  diagnostic: () => {},
  critical: () => {},
  hasCriticalErrors: () => false,
} as any

/**
 * Run real DSL source through the real inspector, then render it. A hand-built
 * fixture only asserts what the author already believes the graph looks like —
 * this asserts what the pipeline actually produces.
 */
async function renderWorkflowSource(body: string) {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-console-e2e-'))
  const stepFile = join(rootDir, 'w.steps.ts')
  const wfFile = join(rootDir, 'w.workflow.ts')
  await writeFile(stepFile, STEPS)
  await writeFile(
    wfFile,
    [
      "import { pikkuWorkflowFunc } from '@pikku/core/workflow'",
      'export const wf = pikkuWorkflowFunc(async (_, data: any, { workflow }) => {',
      body,
      '})',
    ].join('\n')
  )
  try {
    const state: any = await inspect(silentLogger, [stepFile, wfFile], {
      rootDir,
    })
    const gm = state.workflows.graphMeta
    const graph = (gm instanceof Map ? [...gm.values()] : Object.values(gm))[0]
    assert.ok(graph, 'the inspector should have produced a graph')
    return createWorkflowFlow(graph as any)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('createWorkflowFlow — against real inspector output', () => {
  test('a DSL onError renders as a compensation edge to its handler', async () => {
    const { nodes, edges } = await renderWorkflowSource(
      [
        "  await workflow.do('Charge', 'chargeCard', {}, { onError: 'refundOrder' })",
        "  await workflow.do('Ship', 'shipOrder', {})",
        '  return { ok: true }',
      ].join('\n')
    )

    const errorEdge = edges.find((e) => e.label === 'on error')
    assert.ok(
      errorEdge,
      `the compensation route must survive the whole pipeline, got: ${JSON.stringify(
        edges.map(
          (e) => `${e.source}->${e.target}${e.label ? ` (${e.label})` : ''}`
        )
      )}`
    )
    assert.equal(errorEdge.source, 'Charge')
    assert.ok(
      nodes.some((n) => n.id === errorEdge.target),
      'the handler it points at must actually be drawn'
    )
  })

  test('a fanout body renders as its own node, not collapsed into a step', async () => {
    const { nodes } = await renderWorkflowSource(
      [
        '  await Promise.all(data.users.map(async (u: any) => {',
        "    const c = await workflow.do('Charge', 'chargeCard', { id: u.id })",
        "    await workflow.do('Ship', 'shipOrder', { id: c.id })",
        '  }))',
        '  return { ok: true }',
      ].join('\n')
    )

    const ids = nodes.map((n) => n.id)
    assert.ok(
      ids.includes('Charge') && ids.includes('Ship'),
      `both body steps must be drawn, got: ${JSON.stringify(ids)}`
    )
    assert.equal(
      new Set(ids).size,
      ids.length,
      'no two nodes may share an id — a collision silently drops one from the canvas'
    )
    assert.ok(
      nodes.some((n) => n.type === 'fanoutNode'),
      `the loop itself must be drawn, not just its body: if the fanout borrows a
       body step's name they collide on one id and the loop vanishes. Rendered
       types: ${JSON.stringify(nodes.map((n) => n.type))}`
    )
  })
})
