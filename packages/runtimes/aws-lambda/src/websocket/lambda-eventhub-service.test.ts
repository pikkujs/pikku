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
  test('accepts a channel it cannot deliver to, and says so', async () => {
    const warnings: string[] = []
    const hub = new LambdaEventHubService(
      { ...silentLogger, warn: (m: string) => warnings.push(m) } as never,
      event,
      {} as never,
      {} as never
    )
    await hub.onChannelOpened()
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /cannot deliver to an SSE stream/)
  })

  test('closing a channel it never opened is not an error', async () => {
    await service().onChannelClosed()
  })
})
