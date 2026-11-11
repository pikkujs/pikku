import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { endBoundaryWhenSettled, startBoundarySpan } from './boundary-span.js'
import { RecordingTracer } from './testing/recording-tracer.js'
import { createTrace } from './trace.js'

const logger = { info() {}, warn() {}, error() {}, debug() {} }

describe('endBoundaryWhenSettled', () => {
  test('a call that throws synchronously ends the span in error and rethrows', () => {
    const tracer = new RecordingTracer()
    const boundary = startBoundarySpan(
      { tracer, logger },
      { trace: createTrace() },
      'queue.publish q',
      'producer',
      {}
    )
    const boom = new Error('sync')
    assert.throws(
      () =>
        endBoundaryWhenSettled(boundary, () => {
          throw boom
        }),
      boom
    )
    assert.equal(tracer.spans[0]!.status.code, 'error')
  })

  test('a plain return value ends the span ok and is returned as is', () => {
    const tracer = new RecordingTracer()
    const boundary = startBoundarySpan(
      { tracer, logger },
      { trace: createTrace() },
      'queue.publish q',
      'producer',
      {}
    )
    assert.equal(
      endBoundaryWhenSettled(boundary, () => 'job-1'),
      'job-1'
    )
    assert.equal(tracer.spans[0]!.status.code, 'ok')
  })
})
