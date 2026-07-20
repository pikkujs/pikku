import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../../../inspector.js'
import type { InspectorLogger } from '../../../types.js'

const STEP_FILE = [
  "import { pikkuSessionlessFunc } from '@pikku/core'",
  'export const notify = pikkuSessionlessFunc({',
  "  func: async () => ({ id: 'n' }),",
  '})',
].join('\n')

async function nodesFor(body: string): Promise<Record<string, any>> {
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: () => {},
    critical: () => {},
    hasCriticalErrors: () => false,
  } as unknown as InspectorLogger

  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-fid-'))
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
    return graph?.nodes ?? {}
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('fanout node identity — a body step must not overwrite its own loop', () => {
  test('the fanout node survives alongside its named body step', async () => {
    const nodes = await nodesFor(
      [
        '  await Promise.all(',
        '    data.users.map(async (u: any) => {',
        "      await workflow.do('Notify', 'notify', { id: u.id })",
        '    })',
        '  )',
        '  return { ok: true }',
      ].join('\n')
    )

    const fanout = Object.values(nodes).find(
      (n: any) => n.flow === 'fanout'
    ) as any
    assert.ok(
      fanout,
      `the loop must be in the graph — without it the workflow renders as a single call, got: ${JSON.stringify(nodes)}`
    )
    assert.ok(
      fanout.childEntry && nodes[fanout.childEntry],
      'the fanout must point at a body entry node that exists'
    )
    assert.notEqual(
      fanout.nodeId,
      fanout.childEntry,
      'a fanout and its body entry must not share a node id'
    )
    assert.equal((nodes[fanout.childEntry] as any).rpcName, 'notify')
  })

  test('the step following a fanout is still reachable', async () => {
    const nodes = await nodesFor(
      [
        '  await Promise.all(',
        '    data.users.map(async (u: any) => {',
        "      await workflow.do('Notify', 'notify', { id: u.id })",
        '    })',
        '  )',
        '  return { ok: true }',
      ].join('\n')
    )

    const fanout = Object.values(nodes).find(
      (n: any) => n.flow === 'fanout'
    ) as any
    assert.ok(fanout, 'a fanout node should exist')
    assert.ok(
      fanout.next && nodes[fanout.next],
      `the return after the loop must stay reachable, got: ${JSON.stringify(nodes)}`
    )
  })
})
