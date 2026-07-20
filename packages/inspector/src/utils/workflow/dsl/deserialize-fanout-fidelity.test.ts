import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../../../inspector.js'
import type { InspectorLogger } from '../../../types.js'
import { deserializeDslWorkflow } from './deserialize-dsl-workflow.js'

function makeLogger(): InspectorLogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: () => {},
    critical: () => {},
    hasCriticalErrors: () => false,
  } as any
}

const STEP_FILE = [
  "import { pikkuSessionlessFunc } from '@pikku/core'",
  'export const notify = pikkuSessionlessFunc({',
  "  func: async () => ({ id: 'n' }),",
  '})',
].join('\n')

async function roundTrip(body: string): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-rtf-'))
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
    const state: any = await inspect(makeLogger(), [stepFile, wfFile], {
      rootDir,
    })
    const gm = state.workflows.graphMeta
    const graph = (
      gm instanceof Map ? [...gm.values()] : Object.values(gm)
    )[0] as any
    assert.ok(graph, 'a graph should have been produced')
    return deserializeDslWorkflow(graph)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('DSL round-trip — a fanout body keeps everything in it', () => {
  test('a step option inside a fanout body survives', async () => {
    const code = await roundTrip(
      [
        '  await Promise.all(',
        '    data.users.map(async (u: any) => {',
        "      await workflow.do('Notify', 'notify', { id: u.id }, { retries: 3 })",
        '    })',
        '  )',
        '  return { ok: true }',
      ].join('\n')
    )

    assert.ok(
      code.includes('retries: 3'),
      `retries must not be dropped from a fanout body step, got:\n${code}`
    )
  })

  test('a non-RPC step inside a fanout body survives', async () => {
    const code = await roundTrip(
      [
        '  await Promise.all(',
        '    data.users.map(async (u: any) => {',
        "        await workflow.sleep('Stagger', '1s')",
        "        await workflow.do('Notify', 'notify', { id: u.id })",
        '    })',
        '  )',
        '  return { ok: true }',
      ].join('\n')
    )

    assert.ok(
      code.includes("workflow.sleep('Stagger', '1s')"),
      `a sleep inside a fanout body must not be deleted, got:\n${code}`
    )
    assert.ok(
      code.includes("'notify'"),
      `the rpc step must still be there, got:\n${code}`
    )
  })
})
