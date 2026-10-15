import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

describe('addon-support', () => {
  test('the light entry never reaches the validate or inspector graph', () => {
    const source = readFileSync(
      new URL('./addon-support.ts', import.meta.url),
      'utf8'
    )
    assert.doesNotMatch(source, /validate/)
    assert.doesNotMatch(source, /inspector/)
  })

  test('the validate entry carries the project checks', () => {
    const source = readFileSync(
      new URL('./addon-support-validate.ts', import.meta.url),
      'utf8'
    )
    assert.match(source, /runProjectChecks/)
    assert.match(source, /findProjectRoot/)
  })
})
