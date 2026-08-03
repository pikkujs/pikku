import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { serializeQueueWrapper } from './serialize-queue-wrapper.js'

describe('serializeQueueWrapper', () => {
  test('carries the Safe<> guard on the data it forwards', () => {
    const output = serializeQueueWrapper('./pikku-queue-map.gen.js')

    // `QueueService.add` takes `Safe<T>`, which is a deferred conditional type:
    // with `Name` still generic, a bare `QueueMap[Name]['input']` is not
    // assignable to it and the generated client fails to compile. Declaring the
    // parameter as the identical `Safe<...>` both fixes the forward and puts the
    // guard on the API users actually call.
    assert.match(output, /data: Safe<QueueMap\[Name\]\['input'\]>/)
    assert.match(output, /import type \{ Safe \} from '@pikku\/core'/)
  })
})
