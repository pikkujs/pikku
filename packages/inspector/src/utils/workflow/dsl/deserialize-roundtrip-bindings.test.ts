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
  'export const createOrg = pikkuSessionlessFunc({',
  "  func: async () => ({ id: 'o' }),",
  '})',
  'export const createUser = pikkuSessionlessFunc({',
  "  func: async () => ({ id: 'u' }),",
  '})',
  'export const ship = pikkuSessionlessFunc({',
  "  func: async () => ({ id: 's' }),",
  '})',
].join('\n')

async function roundTrip(body: string): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-rtb-'))
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

describe('DSL round-trip — regenerated code must still bind its variables', () => {
  test('a Promise.all group keeps the destructured result bindings', async () => {
    const code = await roundTrip(
      [
        '  const [org, user] = await Promise.all([',
        "    workflow.do('create org', 'createOrg', {}),",
        "    workflow.do('create user', 'createUser', {}),",
        '  ])',
        '  return { orgId: org.id, userId: user.id }',
      ].join('\n')
    )

    assert.ok(
      /const \[org, user\] = await Promise\.all\(\[/.test(code),
      `parallel results must stay bound or the regenerated code cannot compile, got:\n${code}`
    )
  })

  test('a step result bound inside a branch is hoisted so later references compile', async () => {
    const code = await roundTrip(
      [
        '  let shipment: { id: string } | undefined',
        '  if (data.needsShipping) {',
        "    shipment = await workflow.do('Ship', 'ship', {})",
        '  }',
        '  return { shipmentId: shipment }',
      ].join('\n')
    )

    const declaredOutside = /let shipment/.test(code)
    const constInsideBranch = /\{\s*\n\s*const shipment =/.test(code)
    assert.ok(
      declaredOutside && !constInsideBranch,
      `a variable referenced after the branch must be hoisted, not const-scoped inside it, got:\n${code}`
    )
  })
})

describe('DSL round-trip — step names are data, not structure', () => {
  test('a step whose name contains a structural substring is not deleted', async () => {
    const code = await roundTrip(
      [
        "  await workflow.do('sync_case_files', 'createOrg', {})",
        "  await workflow.do('map_item_batch', 'createUser', {})",
        '  return { ok: true }',
      ].join('\n')
    )

    assert.ok(
      code.includes("'sync_case_files'"),
      `a top-level step named like a structural node id must survive, got:\n${code}`
    )
    assert.ok(
      code.includes("'map_item_batch'"),
      `a top-level step named like a structural node id must survive, got:\n${code}`
    )
  })
})
