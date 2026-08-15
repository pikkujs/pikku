import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

const STEPS = [
  "import { pikkuSessionlessFunc } from '@pikku/core'",
  "export const notify = pikkuSessionlessFunc({ func: async () => ({ id: 'n' }) })",
].join('\n')

async function run(body: string) {
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

  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-sleep-'))
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
    const state: any = await inspect(logger, [stepFile, wfFile], { rootDir })
    const gm = state.workflows.graphMeta
    const graph = (gm instanceof Map ? [...gm.values()] : Object.values(gm))[0]
    return { graph: graph as any, diags }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('sleep with a duration that is not a literal', () => {
  test('a variable duration inside a loop is kept, not rejected', async () => {
    const { graph, diags } = await run(
      [
        '  for (const interval of data.intervals) {',
        '    await workflow.sleep(`Wait ${interval}`, interval)',
        "    await workflow.do('Notify', 'notify', {})",
        '  }',
        '  return { sent: true }',
      ].join('\n')
    )

    assert.deepEqual(
      diags.filter((d) => d.includes('sleep')),
      [],
      'a duration only known at runtime is legal — the closure evaluates it'
    )

    const sleepNode = Object.values(graph?.nodes ?? {}).find(
      (n: any) => n.flow === 'sleep'
    ) as any
    assert.ok(sleepNode, 'the sleep must still appear in the graph')
    assert.equal(
      sleepNode.expression,
      'interval',
      'its source text is recorded so the graph can show what it waits on'
    )
  })

  test('a literal duration still round-trips as a value', async () => {
    const { graph, diags } = await run(
      ["  await workflow.sleep('Wait', '5s')", '  return { sent: true }'].join(
        '\n'
      )
    )

    assert.deepEqual(diags, [])
    const sleepNode = Object.values(graph?.nodes ?? {}).find(
      (n: any) => n.flow === 'sleep'
    ) as any
    assert.equal(sleepNode?.duration, '5s')
    assert.equal(
      sleepNode?.expression,
      undefined,
      'a literal is a value, not an expression'
    )
  })
})
