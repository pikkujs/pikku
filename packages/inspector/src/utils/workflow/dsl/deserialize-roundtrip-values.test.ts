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
  'export const ship = pikkuSessionlessFunc({',
  "  func: async () => ({ id: 's' }),",
  '})',
].join('\n')

async function roundTrip(body: string): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-rtv-'))
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

describe('DSL round-trip — values keep their type', () => {
  test('a numeric sleep duration is not turned into a string', async () => {
    const code = await roundTrip(
      ["  await workflow.sleep('Wait', 5000)", '  return { ok: true }'].join(
        '\n'
      )
    )

    assert.ok(
      code.includes("workflow.sleep('Wait', 5000)"),
      `a numeric duration must stay numeric, got:\n${code}`
    )
  })

  test('a string sleep duration keeps its quotes', async () => {
    const code = await roundTrip(
      ["  await workflow.sleep('Wait', '5s')", '  return { ok: true }'].join(
        '\n'
      )
    )

    assert.ok(
      code.includes("workflow.sleep('Wait', '5s')"),
      `a string duration must stay quoted, got:\n${code}`
    )
  })

  test('an assignment expression is not turned into a string literal', async () => {
    const code = await roundTrip(
      ['  let count = 0', '  count = count + 1', '  return { count }'].join(
        '\n'
      )
    )

    assert.ok(
      code.includes('count = count + 1'),
      `an assigned expression must be regenerated as an expression, got:\n${code}`
    )
    assert.ok(
      !code.includes("count = 'count + 1'"),
      'an expression must not be quoted into a string literal'
    )
  })

  test('an assigned string literal keeps its quotes', async () => {
    const code = await roundTrip(
      [
        "  let status = 'pending'",
        "  status = 'done'",
        '  return { status }',
      ].join('\n')
    )

    assert.ok(
      code.includes("status = 'done'"),
      `a string literal must stay a string literal, got:\n${code}`
    )
  })
})
