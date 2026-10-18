import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { canonicalTypeString } from './canonical-type-string.js'

// The native inspector runs the same cases against its own port.
const cases: Array<{ in: string; out: string }> = JSON.parse(
  readFileSync(
    new URL('./canonical-type-string.cases.json', import.meta.url),
    'utf8'
  )
)

describe('canonicalTypeString', () => {
  for (const { in: input, out } of cases) {
    test(JSON.stringify(input), () => {
      assert.equal(canonicalTypeString(input), out)
    })
  }

  test('is idempotent', () => {
    for (const { out } of cases) assert.equal(canonicalTypeString(out), out)
  })
})
