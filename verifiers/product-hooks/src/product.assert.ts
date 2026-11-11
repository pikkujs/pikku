import { describe, test } from 'node:test'
import assert from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const file = join(
  import.meta.dirname,
  '..',
  '.pikku',
  'sdk',
  'api',
  'exposed',
  'pikku-product.gen.ts'
)

describe('generated product hooks', () => {
  test('are written into the backend SDK when events and flags are declared', () => {
    assert.ok(existsSync(file), 'pikku-product.gen.ts is in the SDK')
    const content = readFileSync(file, 'utf-8')
    assert.match(content, /export const useAnalytics =/)
    assert.match(content, /export const useFlag =/)
    assert.match(content, /from '@pikku\/react'/)
  })
})
