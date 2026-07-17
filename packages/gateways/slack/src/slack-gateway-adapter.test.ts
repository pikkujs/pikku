import { test, describe } from 'node:test'
import * as assert from 'assert'
import { createHmac } from 'node:crypto'
import { SlackGatewayAdapter } from './slack-gateway-adapter.js'
import type { PikkuHTTPRequest } from '@pikku/core/http'

const SIGNING_SECRET = 'test-signing-secret'

const signedRequest = (
  body: string,
  overrides: { signature?: string; timestamp?: string } = {}
): PikkuHTTPRequest => {
  const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1000))
  const signature =
    overrides.signature ??
    'v0=' +
      createHmac('sha256', SIGNING_SECRET)
        .update(`v0:${timestamp}:${body}`)
        .digest('hex')
  const headers: Record<string, string> = {
    'x-slack-signature': signature,
    'x-slack-request-timestamp': timestamp,
  }
  return {
    header: (name: string) => headers[name.toLowerCase()] ?? null,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  } as unknown as PikkuHTTPRequest
}

const createAdapter = () =>
  new SlackGatewayAdapter({
    signingSecret: SIGNING_SECRET,
    tokenResolver: async () => 'xoxb-test-token',
  })

describe('SlackGatewayAdapter.verifyWebhook', () => {
  test('echoes url_verification challenge when signature is valid', async () => {
    const adapter = createAdapter()
    const body = JSON.stringify({
      type: 'url_verification',
      challenge: 'challenge-123',
    })
    const result = await adapter.verifyWebhook(
      JSON.parse(body),
      signedRequest(body)
    )
    assert.deepEqual(result, {
      verified: true,
      response: { challenge: 'challenge-123' },
    })
  })

  test('returns verified:false for signed event_callback (falls through to parse)', async () => {
    const adapter = createAdapter()
    const body = JSON.stringify({ type: 'event_callback', event: {} })
    const result = await adapter.verifyWebhook(
      JSON.parse(body),
      signedRequest(body)
    )
    assert.deepEqual(result, { verified: false })
  })

  test('rejects an invalid signature', async () => {
    const adapter = createAdapter()
    const body = JSON.stringify({ type: 'event_callback', event: {} })
    await assert.rejects(
      adapter.verifyWebhook(
        JSON.parse(body),
        signedRequest(body, { signature: 'v0=deadbeef' })
      ),
      /Invalid Slack request signature/
    )
  })

  test('rejects a stale timestamp (replay protection)', async () => {
    const adapter = createAdapter()
    const body = JSON.stringify({ type: 'event_callback', event: {} })
    const stale = String(Math.floor(Date.now() / 1000) - 600)
    // Signature is recomputed for the stale timestamp, so only age fails
    const signature =
      'v0=' +
      createHmac('sha256', SIGNING_SECRET)
        .update(`v0:${stale}:${body}`)
        .digest('hex')
    await assert.rejects(
      adapter.verifyWebhook(
        JSON.parse(body),
        signedRequest(body, { signature, timestamp: stale })
      ),
      /Invalid Slack request signature/
    )
  })

  test('rejects when signature headers are missing', async () => {
    const adapter = createAdapter()
    const request = {
      header: () => null,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as PikkuHTTPRequest
    await assert.rejects(
      adapter.verifyWebhook({ type: 'event_callback' }, request),
      /Missing Slack signature headers/
    )
  })

  test('rejects when no HTTP request access (fail closed)', async () => {
    const adapter = createAdapter()
    await assert.rejects(
      adapter.verifyWebhook({ type: 'url_verification', challenge: 'x' }),
      /cannot be verified/
    )
  })
})
