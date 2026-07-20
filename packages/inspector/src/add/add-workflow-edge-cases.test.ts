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
  'export const notify = pikkuSessionlessFunc({',
  "  func: async () => ({ id: 'n' }),",
  '})',
  'export const audit = pikkuSessionlessFunc({',
  "  func: async () => ({ id: 'a' }),",
  '})',
].join('\n')

async function run(body: string): Promise<{
  nodes: Record<string, any>
  diags: string[]
  code: string
}> {
  const diags: string[] = []
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: (...a: any[]) => diags.push(a.map(String).join(' ')),
    critical: (...a: any[]) => diags.push(a.map(String).join(' ')),
    hasCriticalErrors: () => false,
  } as unknown as InspectorLogger

  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-edge-'))
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
    return {
      nodes: graph?.nodes ?? {},
      diags,
      code: graph ? deserializeDslWorkflow(graph) : '',
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('onError — edge cases', () => {
  test('the handler is not also emitted as a step that always runs', async () => {
    const { code } = await run(
      [
        "  await workflow.do('Charge', 'chargeCard', {}, { onError: 'refundOrder' })",
        '  return { ok: true }',
      ].join('\n')
    )

    const refundCalls = code.match(/'refundOrder'/g) ?? []
    assert.equal(
      refundCalls.length,
      1,
      `the handler must appear only as onError, never as its own sequential step, got:\n${code}`
    )
  })

  test('a non-literal onError is reported, not silently ignored', async () => {
    const { diags } = await run(
      [
        '  const target = data.handler',
        "  await workflow.do('Charge', 'chargeCard', {}, { onError: target })",
        '  return { ok: true }',
      ].join('\n')
    )

    assert.ok(
      diags.some((d) => d.includes('onError')),
      `a non-literal onError must be diagnosed, got: ${JSON.stringify(diags)}`
    )
  })

  test('onError inside a branch still resolves', async () => {
    const { nodes } = await run(
      [
        '  if (data.paid) {',
        "    await workflow.do('Charge', 'chargeCard', {}, { onError: 'refundOrder' })",
        '  }',
        '  return { ok: true }',
      ].join('\n')
    )

    const charge = Object.values(nodes).find(
      (n: any) => n.rpcName === 'chargeCard'
    ) as any
    assert.ok(
      charge?.onError,
      'a branch step should still carry its error route'
    )
    assert.equal((nodes[charge.onError] as any)?.rpcName, 'refundOrder')
  })
})

describe('switch — fall-through to default', () => {
  test('a trailing empty case routes to the default body', async () => {
    const { nodes } = await run(
      [
        '  switch (data.kind) {',
        "    case 'a':",
        "      await workflow.do('Notify', 'notify', {})",
        '      break',
        "    case 'b':",
        '    default:',
        "      await workflow.do('Audit', 'audit', {})",
        '  }',
        '  return { ok: true }',
      ].join('\n')
    )

    const sw = Object.values(nodes).find((n: any) => n.flow === 'switch') as any
    assert.ok(sw, 'a switch node should exist')
    const caseB = (sw.cases ?? []).find((c: any) => c.value === 'b')
    assert.ok(
      caseB,
      `a case falling through to default must not be dropped, got: ${JSON.stringify(sw.cases)}`
    )
    assert.equal(
      caseB.entry,
      sw.defaultEntry,
      'it should route to the default body it falls into'
    )
  })
})

describe('options — numeric values keep their type', () => {
  test('a numeric retryDelay is not quoted', async () => {
    const { code } = await run(
      [
        "  await workflow.do('Charge', 'chargeCard', {}, { retries: 2, retryDelay: 500 })",
        '  return { ok: true }',
      ].join('\n')
    )

    assert.ok(
      code.includes('retryDelay: 500'),
      `a numeric retryDelay must stay numeric, got:\n${code}`
    )
  })
})

describe('sequential fanout — for..of bodies', () => {
  test('a multi-step for..of body keeps every step', async () => {
    const { nodes } = await run(
      [
        '  for (const u of data.users) {',
        "    const c = await workflow.do('Charge', 'chargeCard', { id: u.id })",
        "    await workflow.do('Notify', 'notify', { id: c.id })",
        '  }',
        '  return { ok: true }',
      ].join('\n')
    )

    const fanout = Object.values(nodes).find(
      (n: any) => n.flow === 'fanout'
    ) as any
    assert.ok(fanout, 'a for..of should produce a fanout node')
    assert.notEqual(
      fanout.nodeId,
      fanout.childEntry,
      'the loop and its body entry must not share an id'
    )

    const rpcs = Object.values(nodes)
      .filter((n: any) => n.rpcName)
      .map((n: any) => n.rpcName)
    assert.ok(
      rpcs.includes('chargeCard') && rpcs.includes('notify'),
      `both body steps must survive, got: ${JSON.stringify(rpcs)}`
    )
  })
})
