import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import * as lambdaRuntime from './index.js'

describe('@pikku/lambda', () => {
  test('exports the lambda runtime API', () => {
    assert.equal(typeof lambdaRuntime.createLambdaHandler, 'function')
    assert.equal(typeof lambdaRuntime.LambdaDeploymentService, 'function')
    assert.equal(typeof lambdaRuntime.SQSQueueService, 'function')
    assert.equal(typeof lambdaRuntime.runFetch, 'function')
  })
})
