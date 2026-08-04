import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

const silentLogger = (): InspectorLogger =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: () => {},
    critical: () => {},
    hasCriticalErrors: () => false,
  }) as InspectorLogger

async function metaFor(source: string) {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-audit-'))
  const file = join(rootDir, 'subject.ts')
  await writeFile(file, source)
  const state = await inspect(silentLogger(), [file], { rootDir })
  await rm(rootDir, { recursive: true, force: true })
  return Object.values(state.functions.meta) as any[]
}

const func = (name: string, auditLine: string | null) =>
  [
    "import { pikkuFunc } from '@pikku/core'",
    `export const ${name} = pikkuFunc({`,
    ...(auditLine ? [`  ${auditLine}`] : []),
    '  func: async () => ({ ok: true }),',
    '})',
  ].join('\n')

describe('the audit flag reaches the function meta', () => {
  test('`audit: true` resolves to best-effort', async () => {
    const meta = await metaFor(func('cancelInvoice', 'audit: true,'))
    assert.deepEqual(meta.find((m) => m.name === 'cancelInvoice')?.audit, {
      durability: 'best-effort',
    })
  })

  test('an explicit durability is carried through', async () => {
    const meta = await metaFor(
      func('chargeCard', "audit: { durability: 'transactional' },")
    )
    assert.deepEqual(meta.find((m) => m.name === 'chargeCard')?.audit, {
      durability: 'transactional',
    })
  })

  test('an object without a durability defaults to best-effort', async () => {
    const meta = await metaFor(func('refund', 'audit: {},'))
    assert.deepEqual(meta.find((m) => m.name === 'refund')?.audit, {
      durability: 'best-effort',
    })
  })

  // Absent rather than `false`: an unmarked function drops `auditLog.write()`
  // with a warning, so "no audit key" has to be the honest reading of it.
  test('a function with no audit config carries no audit key', async () => {
    const meta = await metaFor(func('listInvoices', null))
    const found = meta.find((m) => m.name === 'listInvoices')
    assert.ok(found, 'the function should still be registered')
    assert.equal(found.audit, undefined)
  })

  test('`audit: false` is the same as not declaring it', async () => {
    const meta = await metaFor(func('healthCheck', 'audit: false,'))
    assert.equal(meta.find((m) => m.name === 'healthCheck')?.audit, undefined)
  })
})
