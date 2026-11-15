import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getAudits, type GetAuditsOutput } from './get-audits.function.js'

const page = async () => ({ events: [], nextCursor: null })

const run = async (audit: unknown) =>
  (await getAudits.func(
    { audit, logger: { warn: () => {} } } as never,
    {} as never,
    {} as never
  )) as GetAuditsOutput

test('intact is absent when the sink does not implement verify', async () => {
  const result = await run({ query: page })
  assert.equal(result.readable, true)
  assert.equal('intact' in result, false)
})

test('intact is true when the sink verifies its trail', async () => {
  const result = await run({
    query: page,
    verify: async () => ({ intact: true, checked: 3 }),
  })
  assert.equal(result.intact, true)
})

test('intact is false when the sink reports tampering', async () => {
  const result = await run({
    query: page,
    verify: async () => ({ intact: false, checked: 3, firstBadId: 'evt_2' }),
  })
  assert.equal(result.intact, false)
})

test('a verify that throws reads as not intact, not as a failed read', async () => {
  const result = await run({
    query: page,
    verify: async () => {
      throw new Error('boom')
    },
  })
  assert.equal(result.readable, true)
  assert.equal(result.intact, false)
})

test('a write-only sink stays unreadable and reports no intact flag', async () => {
  const result = await run({
    audit: async () => {},
    verify: async () => ({ intact: true, checked: 0 }),
  })
  assert.equal(result.readable, false)
  assert.equal('intact' in result, false)
})
