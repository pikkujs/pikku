import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from '../inspector.js'
import type { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

const makeLogger = (criticals: Array<{ code: ErrorCode; message: string }>) =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: () => {},
    critical: (code: ErrorCode, message: string) => {
      criticals.push({ code, message })
    },
    hasCriticalErrors: () => criticals.length > 0,
  }) satisfies InspectorLogger

const inspectSource = async (source: string) => {
  const criticals: Array<{ code: ErrorCode; message: string }> = []
  const rootDir = await mkdtemp(
    join(dirname(fileURLToPath(import.meta.url)), 'pikku-generated-secret-')
  )
  const file = join(rootDir, 'secret.ts')
  await writeFile(file, source)
  try {
    const state = await inspect(makeLogger(criticals), [file], { rootDir })
    return { state, criticals }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

const secret = (fields: string) => `
import { defineSecret } from '@pikku/core/secret'
import { z } from 'zod'
const schema = z.string()
defineSecret({
  name: 'VISITOR_KEY',
  displayName: 'Visitor key',
  secretId: 'VISITOR_KEY',
  schema: schema,
  ${fields}
})
`

describe('defineSecret generate', () => {
  test('the generate size reaches the definition', async () => {
    const { state, criticals } = await inspectSource(
      secret(`rotationPeriod: '30day', generate: { size: 32 },`)
    )
    assert.deepEqual(criticals, [])
    const def = state.secrets.definitions.find(
      (d) => d.secretId === 'VISITOR_KEY'
    )
    assert.deepEqual(def?.generate, { size: 32 })
  })

  test("rotationPeriod 'never' is accepted", async () => {
    const { state, criticals } = await inspectSource(
      secret(`rotationPeriod: 'never', generate: { size: 32 },`)
    )
    assert.deepEqual(criticals, [])
    const def = state.secrets.definitions.find(
      (d) => d.secretId === 'VISITOR_KEY'
    )
    assert.equal(def?.rotationPeriod, 'never')
  })

  test('a generated secret without a rotationPeriod is a build error', async () => {
    const { criticals } = await inspectSource(secret(`generate: { size: 32 },`))
    assert.equal(criticals.length, 1)
    assert.match(criticals[0]!.message, /rotationPeriod/)
  })

  test('a size below the minimum is a build error', async () => {
    const { criticals } = await inspectSource(
      secret(`rotationPeriod: '30day', generate: { size: 3 },`)
    )
    assert.equal(criticals.length, 1)
    assert.match(criticals[0]!.message, /size/)
  })

  test('a missing size is a build error', async () => {
    const { criticals } = await inspectSource(
      secret(`rotationPeriod: '30day', generate: {},`)
    )
    assert.equal(criticals.length, 1)
    assert.match(criticals[0]!.message, /size/)
  })
})
