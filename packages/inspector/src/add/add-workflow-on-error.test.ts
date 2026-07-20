import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'
import { deserializeDslWorkflow } from '../utils/workflow/dsl/deserialize-dsl-workflow.js'

const STEP_FILE = [
  "import { pikkuSessionlessFunc } from '@pikku/core'",
  'export const chargeCard = pikkuSessionlessFunc({',
  "  func: async () => ({ id: 'c' }),",
  '})',
  'export const refundOrder = pikkuSessionlessFunc({',
  "  func: async () => ({ id: 'r' }),",
  '})',
].join('\n')

const WORKFLOW_BODY = [
  "  await workflow.do('Charge', 'chargeCard', { id: data.id }, {",
  '    retries: 3,',
  "    onError: 'refundOrder',",
  '  })',
  '  return { ok: true }',
].join('\n')

async function inspectWorkflow(body: string): Promise<{
  nodes: Record<string, any>
  invoked: string[]
  code: string
}> {
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: () => {},
    critical: () => {},
    hasCriticalErrors: () => false,
  } as unknown as InspectorLogger

  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-oe-'))
  const stepFile = join(rootDir, 'w.steps.ts')
  const wfFile = join(rootDir, 'w.workflow.ts')
  await writeFile(stepFile, STEP_FILE)
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
    const state: any = await inspect(logger, [stepFile, wfFile], { rootDir })
    const gm = state.workflows.graphMeta
    const graph = (
      gm instanceof Map ? [...gm.values()] : Object.values(gm)
    )[0] as any
    assert.ok(graph, 'a graph should have been produced')
    return {
      nodes: graph.nodes,
      invoked: [...(state.rpc?.invokedFunctions ?? [])],
      code: deserializeDslWorkflow(graph),
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('DSL onError — compensation is part of the graph', () => {
  test('the handler becomes a node the failing step points at', async () => {
    const { nodes } = await inspectWorkflow(WORKFLOW_BODY)

    const charge = Object.values(nodes).find(
      (n: any) => n.rpcName === 'chargeCard'
    ) as any
    assert.ok(charge, 'the charging step should exist')
    assert.ok(
      charge.onError,
      `the step must record its error route so the graph can render it, got: ${JSON.stringify(charge)}`
    )

    const handlerId = Array.isArray(charge.onError)
      ? charge.onError[0]
      : charge.onError
    const handler = nodes[handlerId]
    assert.ok(
      handler,
      `onError must point at a real node so an edge can be drawn, got id '${handlerId}' in ${JSON.stringify(Object.keys(nodes))}`
    )
    assert.equal(handler.rpcName, 'refundOrder')
  })

  test('the handler RPC is registered as invoked so it gets wired', async () => {
    const { invoked } = await inspectWorkflow(WORKFLOW_BODY)

    assert.ok(
      invoked.includes('refundOrder'),
      `the compensation RPC must be wired, got: ${JSON.stringify(invoked)}`
    )
  })

  test('onError survives regeneration back to code', async () => {
    const { code } = await inspectWorkflow(WORKFLOW_BODY)

    assert.ok(
      code.includes("onError: 'refundOrder'"),
      `onError must round-trip as an rpc name, got:\n${code}`
    )
    assert.ok(
      code.includes('retries: 3'),
      'other options must still round-trip'
    )
  })
})
