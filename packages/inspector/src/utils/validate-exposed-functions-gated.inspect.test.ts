import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

/**
 * The unit tests hand the check meta directly. These run the real inspector, so
 * they also prove that an explicit `auth: false` survives into meta rather than
 * being folded into "not written".
 */
async function inspectSource(source: string) {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-pku574-'))
  const file = join(rootDir, 'subject.ts')
  await writeFile(file, source)
  const diagnostics: Array<{ code: string; message: string }> = []
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: ({ code, message }: any) => diagnostics.push({ code, message }),
    critical: (code: any, message: string) =>
      diagnostics.push({ code, message }),
    hasCriticalErrors: () => false,
  } as InspectorLogger
  const state = await inspect(logger, [file], { rootDir })
  await rm(rootDir, { recursive: true, force: true })
  return { state, diagnostics }
}

const exposedSessionless = (authLine: string) =>
  [
    "import { pikkuSessionlessFunc } from '@pikku/core'",
    'export const getCatalogue = pikkuSessionlessFunc({',
    '  expose: true,',
    authLine,
    '  func: async () => ({ ok: true }),',
    '})',
  ].join('\n')

const warned = (diagnostics: Array<{ code: string }>) =>
  diagnostics.some((d) => d.code === ErrorCode.EXPOSED_FUNCTION_HAS_NO_GATE)

describe('PKU574 through the inspector', () => {
  test('an explicit auth: false is recorded on meta and not warned about', async () => {
    const { state, diagnostics } = await inspectSource(
      exposedSessionless('  auth: false,')
    )

    assert.equal(state.functions.meta.getCatalogue?.auth, false)
    assert.equal(warned(diagnostics), false)
  })

  test('leaving auth out still warns', async () => {
    const { state, diagnostics } = await inspectSource(exposedSessionless(''))

    assert.equal(state.functions.meta.getCatalogue?.auth, undefined)
    assert.equal(warned(diagnostics), true)
  })
})
