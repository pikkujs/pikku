import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { CFWorkerSchemaService } from './index.js'

describe('@pikku/schema-cfworker', () => {
  test('exports the cfworker schema service API', () => {
    assert.equal(typeof CFWorkerSchemaService, 'function')
  })
})
