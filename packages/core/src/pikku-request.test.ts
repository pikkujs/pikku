import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { PikkuRequest } from './pikku-request.js'

class TestPikkuRequest<In> extends PikkuRequest<In> {}

describe('PikkuRequest', () => {
  test('returns stored data', async () => {
    const request = new TestPikkuRequest({ hello: 'world' })

    assert.deepEqual(await request.data(), { hello: 'world' })
  })

  test('preserves falsey payloads', async () => {
    await assert.doesNotReject(async () => {
      const zeroRequest = new TestPikkuRequest(0)
      assert.equal(await zeroRequest.data(), 0)

      const falseRequest = new TestPikkuRequest(false)
      assert.equal(await falseRequest.data(), false)

      const emptyStringRequest = new TestPikkuRequest('')
      assert.equal(await emptyStringRequest.data(), '')
    })
  })

  test('throws when data is undefined', async () => {
    const request = new TestPikkuRequest(undefined as never)

    await assert.rejects(() => request.data(), {
      message: 'Data not found',
    })
  })
})
