import { describe, test } from 'node:test'
import assert from 'node:assert'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

describe('generated product hooks', () => {
  test('are not written when the app declares no events and no flags', () => {
    const exposed = join(
      import.meta.dirname,
      '..',
      '.pikku',
      'sdk',
      'api',
      'exposed'
    )
    assert.ok(existsSync(exposed), 'the backend SDK was generated')
    assert.ok(!existsSync(join(exposed, 'pikku-product.gen.ts')))
  })
})
