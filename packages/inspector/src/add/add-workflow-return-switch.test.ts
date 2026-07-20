import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

const STEP_FILE = [
  "import { pikkuSessionlessFunc } from '@pikku/core'",
  'export const ship = pikkuSessionlessFunc({',
  "  func: async () => ({ id: 's', ok: true }),",
  '})',
].join('\n')

async function inspectWorkflow(body: string): Promise<{
  nodes: Record<string, any>
  diags: string[]
}> {
  const diags: string[] = []
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: (d: any) => diags.push(d?.message ?? String(d)),
    critical: (d: any) => diags.push(d?.message ?? String(d)),
    hasCriticalErrors: () => false,
  } as unknown as InspectorLogger

  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-rs-'))
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
    return { nodes: graph?.nodes ?? {}, diags }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('switch extraction — a fall-through case is a real case', () => {
  test("case 'a': case 'b': records both values", async () => {
    const { nodes } = await inspectWorkflow(
      [
        '  switch (data.kind) {',
        "    case 'a':",
        "    case 'b':",
        "      await workflow.do('Ship', 'ship', {})",
        '      break',
        '  }',
        '  return { ok: true }',
      ].join('\n')
    )

    const switchNode = Object.values(nodes).find(
      (n: any) => n.flow === 'switch'
    ) as any
    assert.ok(switchNode, 'a switch node should exist')
    const values = (switchNode.cases ?? []).map((c: any) => c.value)
    assert.deepEqual(
      values.sort(),
      ['a', 'b'],
      `a fall-through case must not be dropped, got: ${JSON.stringify(switchNode.cases)}`
    )
    const entries = new Set((switchNode.cases ?? []).map((c: any) => c.entry))
    assert.equal(entries.size, 1, 'both cases should share the same entry')
  })
})

describe('return extraction — a spread output is not silently dropped', () => {
  test('return { ...r, extra } keeps the spread', async () => {
    const { nodes } = await inspectWorkflow(
      [
        "  const r = await workflow.do('Ship', 'ship', {})",
        '  return { ...r, extra: 1 }',
      ].join('\n')
    )

    const returnNode = Object.values(nodes).find(
      (n: any) => n.flow === 'return'
    ) as any
    assert.ok(returnNode, 'a return node should exist')
    assert.deepEqual(
      returnNode.spread,
      ['r'],
      `the spread source must be recorded, got: ${JSON.stringify(returnNode)}`
    )
  })

  test('return r produces a return node', async () => {
    const { nodes } = await inspectWorkflow(
      ["  const r = await workflow.do('Ship', 'ship', {})", '  return r'].join(
        '\n'
      )
    )

    const returnNode = Object.values(nodes).find(
      (n: any) => n.flow === 'return'
    ) as any
    assert.ok(
      returnNode,
      `returning a variable must still produce a return node, got: ${JSON.stringify(nodes)}`
    )
    assert.deepEqual(returnNode.spread, ['r'])
  })
})
