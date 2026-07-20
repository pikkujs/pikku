import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

function makeLogger(diags: string[]): InspectorLogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: ({ code, message }: any) => {
      diags.push(`${code}: ${message}`)
    },
    critical: (code: any, message: string) => {
      diags.push(`${code}: ${message}`)
    },
    hasCriticalErrors: () => false,
  }
}

const STEP_FILE = [
  "import { pikkuSessionlessFunc } from '@pikku/core'",
  'export const listUsers = pikkuSessionlessFunc({',
  "  func: async () => ({ users: [{ id: '1', email: 'a@b.c' }] }),",
  '})',
  'export const rpcA = pikkuSessionlessFunc({',
  "  func: async () => ({ id: 'a' }),",
  '})',
  'export const rpcB = pikkuSessionlessFunc({',
  "  func: async () => ({ id: 'b' }),",
  '})',
  'export const rpcC = pikkuSessionlessFunc({',
  '  func: async () => ({ ok: true }),',
  '})',
].join('\n')

async function inspectWorkflow(body: string) {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-drops-'))
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
  const diags: string[] = []
  try {
    const state: any = await inspect(makeLogger(diags), [stepFile, wfFile], {
      rootDir,
    })
    const metaMap = state.workflows.meta
    const meta = (
      metaMap instanceof Map ? [...metaMap.values()] : Object.values(metaMap)
    )[0] as any
    return {
      invoked: [...state.rpc.invokedFunctions] as string[],
      steps: (meta?.steps ?? []) as any[],
      diags,
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('DSL extraction — constructs that must not be silently dropped', () => {
  test('a property access on the loop item (u.id) survives as an item input', async () => {
    const { steps } = await inspectWorkflow(
      [
        "  const audience = await workflow.do('collect', 'listUsers', {})",
        '  await Promise.all(',
        '    audience.users.map(async (u) => {',
        "      await workflow.do('send', 'rpcC', { userId: u.id, tag: 'x' })",
        '    })',
        '  )',
        '  return { ok: true }',
      ].join('\n')
    )

    const fanout = steps.find((s) => s.type === 'fanout')
    assert.ok(fanout, 'fanout step should be extracted')
    const send = fanout.body?.[0]
    assert.ok(send, 'the fanout body step should be extracted')
    assert.deepEqual(
      send.inputs?.userId,
      { from: 'item', path: 'id' },
      `u.id must map to the loop item, got: ${JSON.stringify(send.inputs)}`
    )
    assert.deepEqual(
      send.inputs?.tag,
      { from: 'literal', value: 'x' },
      'sibling literal inputs must still survive'
    )
  })

  test('array destructuring of a Promise.all group keeps both steps and binds each result', async () => {
    const { invoked, steps } = await inspectWorkflow(
      [
        '  const [org, user] = await Promise.all([',
        "    workflow.do('create org', 'rpcA', {}),",
        "    workflow.do('create user', 'rpcB', {}),",
        '  ])',
        '  return { orgId: org.id, userId: user.id }',
      ].join('\n')
    )

    assert.ok(invoked.includes('rpcA'), 'rpcA must not be dropped')
    assert.ok(invoked.includes('rpcB'), 'rpcB must not be dropped')

    const parallel = steps.find((s) => s.type === 'parallel')
    assert.ok(parallel, 'a parallel step should be extracted')
    assert.deepEqual(
      parallel.children?.map((c: any) => c.outputVar),
      ['org', 'user'],
      'each destructured name should bind to its matching child step'
    )

    const ret = steps.find((s) => s.type === 'return')
    assert.deepEqual(
      ret?.outputs?.orgId,
      { from: 'outputVar', name: 'org', path: 'id' },
      'org.id must resolve to the bound step output, not degrade to a trigger input'
    )
  })

  test('object destructuring of a step result reports a diagnostic instead of silently dropping', async () => {
    const { invoked, diags } = await inspectWorkflow(
      [
        "  const { id } = await workflow.do('s', 'rpcA', {})",
        '  return { id }',
      ].join('\n')
    )

    const dropped = !invoked.includes('rpcA')
    assert.ok(
      !dropped || diags.length > 0,
      'if the step is dropped the user must be told — silence is the bug'
    )
  })

  test('a brace-less for-of body is still extracted as a sequential fanout', async () => {
    const { invoked, steps } = await inspectWorkflow(
      [
        '  for (const email of data.emails)',
        "    await workflow.do('invite', 'rpcA', { email })",
        '  return { ok: true }',
      ].join('\n')
    )

    assert.ok(invoked.includes('rpcA'), 'rpcA must not be dropped')
    const fanout = steps.find((s) => s.type === 'fanout')
    assert.ok(fanout, 'a brace-less for-of should still produce a fanout step')
    assert.equal(fanout.mode, 'sequential')
  })
})
