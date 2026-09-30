import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { LambdaEventHubService } from './lambda-eventhub-service.js'

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

/** Enough of an APIGatewayEvent for the management client to be constructed. */
const event = {
  requestContext: { domainName: 'example.execute-api.eu-west-1.amazonaws.com', stage: 'prod' },
} as never

const service = () =>
  new LambdaEventHubService(
    silentLogger as never,
    event,
    {} as never,
    {} as never
  )

describe('LambdaEventHubService channel lifecycle', () => {
  test('refuses to open a channel it has no way to deliver to', async () => {
    await assert.rejects(
      service().onChannelOpened(),
      /cannot serve SSE/,
      'an SSE stream registered here would never receive a published event'
    )
  })

  test('closing a channel it never opened is not an error', async () => {
    await service().onChannelClosed()
  })
})
