import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import * as azureFunctions from './index.js'

describe('@pikku/azure-functions', () => {
  test('exports the azure runtime API', () => {
    assert.equal(typeof azureFunctions.createAzureHandler, 'function')
    assert.equal(typeof azureFunctions.AzureDeploymentService, 'function')
    assert.equal(typeof azureFunctions.AzureQueueService, 'function')
    assert.equal(typeof azureFunctions.AzInvocationLogger, 'function')
  })
})
