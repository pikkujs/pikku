import { createConfig, createSingletonServices } from './services.js'
import '../.pikku/pikku-bootstrap.gen.js'

import { wireGateway, startListenerGateway } from '@pikku/core/gateway'
import { fetch } from '@pikku/core'
import { runLocalChannel } from '@pikku/core/channel/local'
import { PikkuFetchHTTPRequest, PikkuFetchHTTPResponse } from '@pikku/core/http'
import { MockGatewayAdapter } from './mock-adapter.js'

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    )
  }
}

function assert(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${label}`)
  }
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

interface TestResult {
  name: string
  passed: boolean
  error?: string
}

const results: TestResult[] = []

async function runTest(
  name: string,
  fn: () => Promise<void>
): Promise<boolean> {
  try {
    await fn()
    results.push({ name, passed: true })
    console.log(`  ✓ ${name}`)
    return true
  } catch (e: any) {
    results.push({ name, passed: false, error: e.message })
    console.log(`  ✗ ${name}`)
    console.log(`    ${e.message}`)
    return false
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = await createConfig()
  const singletonServices = await createSingletonServices(config)

  console.log('\nGateway Verifier')
  console.log('================')
  console.log('\nTests all three gateway transport types with a mock adapter:')
  console.log('  - webhook: HTTP POST/GET routes')
  console.log('  - websocket: channel-based message handling')
  console.log('  - listener: standalone event loop')

  // Create separate adapters per gateway for clean assertion isolation
  const webhookAdapter = new MockGatewayAdapter()
  const wsAdapter = new MockGatewayAdapter()
  const listenerAdapter = new MockGatewayAdapter()

  // Shared handler function — logs gateway info and echoes text
  const createHandler = () => ({
    func: async (services: any, data: any, wire: any) => {
      services.logger.info({
        type: 'gateway-handler',
        gatewayName: wire.gateway.gatewayName,
        senderId: data.senderId,
        platform: wire.gateway.platform,
        text: data.text,
      })
      return { text: `echo: ${data.text}` }
    },
  })

  // Wire all three gateway types
  wireGateway({
    name: 'test-webhook',
    type: 'webhook',
    route: '/webhooks/test',
    adapter: webhookAdapter,
    func: createHandler(),
  })

  wireGateway({
    name: 'test-ws',
    type: 'websocket',
    route: '/gateway/ws',
    adapter: wsAdapter,
    func: createHandler(),
  })

  wireGateway({
    name: 'test-listener',
    type: 'listener',
    adapter: listenerAdapter,
    func: createHandler(),
  })

  // =========================================================================
  // Webhook tests
  // =========================================================================

  console.log('\n── Webhook Gateway ──')

  await runTest('POST processes message and auto-sends response', async () => {
    webhookAdapter.clear()

    const request = new Request('http://localhost/webhooks/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: 'user-1', text: 'hello' }),
    })

    const response = await fetch(request)
    assertEqual(response.status, 200, 'HTTP status')

    // Adapter should have auto-sent the response
    assertEqual(webhookAdapter.sentMessages.length, 1, 'sent messages count')
    assertEqual(webhookAdapter.sentMessages[0]!.senderId, 'user-1', 'senderId')
    assertEqual(
      webhookAdapter.sentMessages[0]!.message.text,
      'echo: hello',
      'response text'
    )
  })

  await runTest('POST returns 200 OK for ignored events', async () => {
    webhookAdapter.clear()

    const request = new Request('http://localhost/webhooks/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'delivery_receipt' }),
    })

    const response = await fetch(request)
    assertEqual(response.status, 200, 'HTTP status')
    assertEqual(webhookAdapter.sentMessages.length, 0, 'no messages sent')
  })

  await runTest('GET handles webhook verification challenge', async () => {
    const request = new Request(
      'http://localhost/webhooks/test?hub.mode=subscribe&hub.verify_token=test-token&hub.challenge=my-challenge',
      { method: 'GET' }
    )

    const response = await fetch(request)
    assertEqual(response.status, 200, 'HTTP status')

    const body = await response.json()
    assertEqual(body, 'my-challenge', 'challenge response')
  })

  await runTest('GET rejects invalid verification token', async () => {
    const request = new Request(
      'http://localhost/webhooks/test?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge',
      { method: 'GET' }
    )

    const response = await fetch(request)
    assertEqual(response.status, 200, 'HTTP status')

    const body = await response.json()
    assertEqual(body.error, 'Verification failed', 'rejection error')
  })

  await runTest('POST populates wire.gateway for middleware', async () => {
    webhookAdapter.clear()
    const logger = singletonServices.logger as any
    logger.clear()

    const request = new Request('http://localhost/webhooks/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: 'mw-user', text: 'middleware test' }),
    })

    await fetch(request)

    // Verify handler received correct gateway context
    const logs = logger.getLogs()
    const handlerLog = logs.find(
      (l: any) =>
        l.type === 'gateway-handler' && l.gatewayName === 'test-webhook'
    )
    assert(!!handlerLog, 'handler log exists')
    assertEqual(handlerLog.senderId, 'mw-user', 'senderId in handler')
    assertEqual(handlerLog.platform, 'mock', 'platform in handler')
  })

  await runTest('wire.gateway.send() sends proactive messages', async () => {
    // Wire a separate gateway with a handler that sends proactively
    const proactiveAdapter = new MockGatewayAdapter()
    wireGateway({
      name: 'test-proactive',
      type: 'webhook',
      route: '/webhooks/proactive',
      adapter: proactiveAdapter,
      func: {
        func: async (_services: any, _data: any, wire: any) => {
          await wire.gateway.send({ text: 'proactive message' })
          // Return nothing — no auto-send
        },
      },
    })

    const request = new Request('http://localhost/webhooks/proactive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: 'pro-user', text: 'trigger' }),
    })

    await fetch(request)

    assertEqual(
      proactiveAdapter.sentMessages.length,
      1,
      'proactive message sent'
    )
    assertEqual(
      proactiveAdapter.sentMessages[0]!.message.text,
      'proactive message',
      'proactive text'
    )
    assertEqual(
      proactiveAdapter.sentMessages[0]!.senderId,
      'pro-user',
      'proactive senderId'
    )
  })

  // =========================================================================
  // Listener tests
  // =========================================================================

  console.log('\n── Listener Gateway ──')

  await runTest('processes messages via handleMessage callback', async () => {
    listenerAdapter.clear()

    const handleMessage = await startListenerGateway(
      'test-listener',
      singletonServices as any
    )

    await (handleMessage as any)({
      senderId: 'listener-user',
      text: 'hello from listener',
    })

    assertEqual(listenerAdapter.sentMessages.length, 1, 'sent messages count')
    assertEqual(
      listenerAdapter.sentMessages[0]!.senderId,
      'listener-user',
      'senderId'
    )
    assertEqual(
      listenerAdapter.sentMessages[0]!.message.text,
      'echo: hello from listener',
      'response text'
    )
  })

  await runTest('ignores events when adapter returns null', async () => {
    listenerAdapter.clear()

    const handleMessage = await startListenerGateway(
      'test-listener',
      singletonServices as any
    )

    await (handleMessage as any)({ type: 'delivery_receipt' })

    assertEqual(listenerAdapter.sentMessages.length, 0, 'no messages sent')
  })

  await runTest('populates wire.gateway in handler', async () => {
    listenerAdapter.clear()
    const logger = singletonServices.logger as any
    logger.clear()

    const handleMessage = await startListenerGateway(
      'test-listener',
      singletonServices as any
    )

    await (handleMessage as any)({ senderId: 'ctx-user', text: 'context test' })

    const logs = logger.getLogs()
    const handlerLog = logs.find(
      (l: any) =>
        l.type === 'gateway-handler' && l.gatewayName === 'test-listener'
    )
    assert(!!handlerLog, 'handler log exists')
    assertEqual(handlerLog.senderId, 'ctx-user', 'senderId')
    assertEqual(handlerLog.platform, 'mock', 'platform')
  })

  await runTest('throws for non-existent gateway name', async () => {
    try {
      await startListenerGateway('nonexistent', singletonServices as any)
      throw new Error('should have thrown')
    } catch (e: any) {
      assert(e.message.includes('not found'), 'error mentions not found')
    }
  })

  // =========================================================================
  // WebSocket tests
  // =========================================================================

  console.log('\n── WebSocket Gateway ──')

  await runTest('processes messages via channel handler', async () => {
    wsAdapter.clear()

    const request = new PikkuFetchHTTPRequest(
      new Request('http://localhost/gateway/ws', { method: 'GET' })
    )
    const response = new PikkuFetchHTTPResponse()

    const channelHandler = await runLocalChannel({
      channelId: crypto.randomUUID(),
      request,
      response,
      route: '/gateway/ws',
    })

    assert(!!channelHandler, 'channel handler created')

    const sentToClient: any[] = []
    channelHandler!.registerOnSend((message) => {
      sentToClient.push(message)
    })

    channelHandler!.open()

    await channelHandler!.message(
      JSON.stringify({ senderId: 'ws-user', text: 'hello via ws' })
    )

    channelHandler!.close()

    // The gateway handler returns { text: 'echo: hello via ws' }
    // which gets sent via channel.send() by the websocket gateway handler
    assert(sentToClient.length > 0, 'messages sent to client')
  })

  await runTest(
    'ignores events when adapter returns null via channel',
    async () => {
      wsAdapter.clear()

      const request = new PikkuFetchHTTPRequest(
        new Request('http://localhost/gateway/ws', { method: 'GET' })
      )
      const response = new PikkuFetchHTTPResponse()

      const channelHandler = await runLocalChannel({
        channelId: crypto.randomUUID(),
        request,
        response,
        route: '/gateway/ws',
      })

      assert(!!channelHandler, 'channel handler created')

      const sentToClient: any[] = []
      channelHandler!.registerOnSend((message) => {
        sentToClient.push(message)
      })

      channelHandler!.open()

      // Send data without 'text' — adapter.parse() returns null
      await channelHandler!.message(
        JSON.stringify({ type: 'typing_indicator' })
      )

      channelHandler!.close()

      // No auto-response should be sent for ignored events
      // (the channel may still send an empty result, but adapter.send should not be called)
      assertEqual(wsAdapter.sentMessages.length, 0, 'no adapter.send calls')
    }
  )

  // =========================================================================
  // Summary
  // =========================================================================

  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length

  console.log(`\n${'─'.repeat(40)}`)
  console.log(
    `Results: ${passed} passed, ${failed} failed, ${results.length} total`
  )

  if (failed > 0) {
    console.log('\nFailed tests:')
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ✗ ${r.name}: ${r.error}`)
    }
    console.log('\n✗ Some gateway tests failed!')
    process.exit(1)
  } else {
    console.log('\n✓ All gateway tests passed!')
  }
}

main().catch((e) => {
  console.error('\n✗ Fatal error:', e.message)
  console.error(e.stack)
  process.exit(1)
})
