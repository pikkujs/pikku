import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ErrorCode } from '@pikku/inspector'

const docs = readFileSync(
  new URL('../../../../docs/services.md', import.meta.url),
  'utf8'
)

const providerCodes = Object.values(ErrorCode).filter((code) => {
  const number = Number(code.slice(3))
  return number >= 369 && number <= 399 && number !== 370 && number !== 384
})

describe('docs/services.md', () => {
  test('there are provider codes to document', () => {
    assert.ok(providerCodes.length >= 28, providerCodes.join(', '))
  })

  for (const code of providerCodes) {
    test(`documents ${code}`, () => {
      assert.ok(docs.includes(code), `${code} is missing from docs/services.md`)
    })
  }
})
