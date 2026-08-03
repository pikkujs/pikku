import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger, InspectorOptions } from '../types.js'

function makeLogger(
  criticals: Array<{ code: string; message: string }>
): InspectorLogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: ({ code, message }: any) => criticals.push({ code, message }),
    critical: (code: any, message: string) => criticals.push({ code, message }),
    hasCriticalErrors: () => criticals.length > 0,
  } as InspectorLogger
}

async function run(source: string, allow: InspectorOptions['allow'] = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-allow-'))
  const file = join(rootDir, 'subject.ts')
  await writeFile(file, source)
  const criticals: Array<{ code: string; message: string }> = []
  const state = await inspect(makeLogger(criticals), [file], {
    rootDir,
    allow,
  })
  await rm(rootDir, { recursive: true, force: true })
  return { state, criticals }
}

const has = (criticals: Array<{ code: string }>, code: ErrorCode) =>
  criticals.some((c) => c.code === code)

const PERMISSIONS_IN_BODY = [
  "import { pikkuSessionlessFunc } from '@pikku/core'",
  'export const stripeWebhook = pikkuSessionlessFunc({',
  '  expose: true,',
  '  permissionsInBody: true,',
  '  func: async () => ({ ok: true }),',
  '})',
].join('\n')

const COMPLEX_WORKFLOW = [
  "import { pikkuWorkflowComplexFunc } from '@pikku/core/workflow'",
  'export const cleanup = pikkuWorkflowComplexFunc(',
  '  async (_services, _input, { workflow }: any) => {',
  '    for (const id of [1, 2, 3]) {',
  "      await workflow.step('touch', { id })",
  '    }',
  '    return { ok: true }',
  '  }',
  ')',
].join('\n')

describe('allow: escape hatches are refused unless opted into', () => {
  test('permissionsInBody is a critical when not allowed', async () => {
    const { criticals } = await run(PERMISSIONS_IN_BODY)
    assert.ok(
      has(criticals, ErrorCode.PERMISSIONS_IN_BODY_NOT_ALLOWED),
      `expected PKU576, got ${JSON.stringify(criticals)}`
    )
  })

  test('the message names the flag that would permit it', async () => {
    const { criticals } = await run(PERMISSIONS_IN_BODY)
    const found = criticals.find(
      (c) => c.code === ErrorCode.PERMISSIONS_IN_BODY_NOT_ALLOWED
    )
    assert.match(found!.message, /allow: \{ permissionsInBody: true \}/)
    assert.match(found!.message, /stripeWebhook/)
  })

  test('permissionsInBody is accepted once allowed', async () => {
    const { criticals, state } = await run(PERMISSIONS_IN_BODY, {
      permissionsInBody: true,
    })
    assert.equal(
      has(criticals, ErrorCode.PERMISSIONS_IN_BODY_NOT_ALLOWED),
      false
    )
    const meta = Object.values(state.functions.meta) as any[]
    assert.equal(
      meta.find((m) => m.name === 'stripeWebhook')?.permissionsInBody,
      true
    )
  })

  test('a refused function is not registered at all', async () => {
    const { state } = await run(PERMISSIONS_IN_BODY)
    const meta = Object.values(state.functions.meta) as any[]
    assert.equal(
      meta.some((m) => m.name === 'stripeWebhook'),
      false,
      'a refused function must not reach the meta, or the build would emit it anyway'
    )
  })

  test('complexWorkflows is a critical when not allowed', async () => {
    const { criticals } = await run(COMPLEX_WORKFLOW)
    assert.ok(
      has(criticals, ErrorCode.COMPLEX_WORKFLOW_NOT_ALLOWED),
      `expected PKU643, got ${JSON.stringify(criticals)}`
    )
  })

  test('the complex-workflow message points at the DSL', async () => {
    const { criticals } = await run(COMPLEX_WORKFLOW)
    const found = criticals.find(
      (c) => c.code === ErrorCode.COMPLEX_WORKFLOW_NOT_ALLOWED
    )
    assert.match(found!.message, /pikkuWorkflowFunc/)
    assert.match(found!.message, /allow: \{ complexWorkflows: true \}/)
  })

  test('complexWorkflows is accepted once allowed', async () => {
    const { criticals } = await run(COMPLEX_WORKFLOW, {
      complexWorkflows: true,
    })
    assert.equal(has(criticals, ErrorCode.COMPLEX_WORKFLOW_NOT_ALLOWED), false)
  })

  test('an ordinary function and DSL workflow are unaffected', async () => {
    const { criticals } = await run(
      [
        "import { pikkuFunc } from '@pikku/core'",
        'export const ordinary = pikkuFunc({',
        '  expose: true,',
        '  func: async () => ({ ok: true }),',
        '})',
      ].join('\n')
    )
    assert.equal(
      has(criticals, ErrorCode.PERMISSIONS_IN_BODY_NOT_ALLOWED),
      false
    )
    assert.equal(has(criticals, ErrorCode.COMPLEX_WORKFLOW_NOT_ALLOWED), false)
  })
})
