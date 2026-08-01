import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'

import {
  CHANNEL_RPC_RESPONSE,
  ChannelDeploymentService,
  ChannelRPCError,
  ChannelRPCRegistry,
  createChannelRPCResponder,
  isChannelRPCRequest,
  type ChannelRPCRequest,
} from './channel-rpc.js'

/**
 * Wires a "server" ChannelDeploymentService to a "client" responder so the
 * pair round-trips in-process, standing in for the two ends of a socket.
 */
const connect = (
  capabilities: Record<string, (data: any) => any>,
  timeoutMs?: number
) => {
  const clientSent: unknown[] = []
  const serverSent: unknown[] = []

  const respond = createChannelRPCResponder({
    capabilities,
    send: async (data) => {
      clientSent.push(data)
      service.handleResponse(data)
    },
  })

  const service = new ChannelDeploymentService(async (data) => {
    serverSent.push(data)
    await respond(data)
  }, timeoutMs)

  return { service, clientSent, serverSent }
}

describe('ChannelRPCRegistry', () => {
  test('settles the call matching a response id', async () => {
    const registry = new ChannelRPCRegistry()
    const a = registry.register()
    const b = registry.register()

    assert.equal(registry.inFlight, 2)

    registry.settle({
      action: CHANNEL_RPC_RESPONSE,
      id: b.id,
      ok: true,
      result: 'b-result',
    })

    assert.equal(await b.promise, 'b-result')
    assert.equal(registry.inFlight, 1, 'the other call stays in flight')

    registry.settle({
      action: CHANNEL_RPC_RESPONSE,
      id: a.id,
      ok: true,
      result: 'a-result',
    })
    assert.equal(await a.promise, 'a-result')
  })

  test('rejects with the remote error rather than resolving undefined', async () => {
    const registry = new ChannelRPCRegistry()
    const call = registry.register()

    registry.settle({
      action: CHANNEL_RPC_RESPONSE,
      id: call.id,
      ok: false,
      error: { name: 'NotFoundError', message: 'no such branch' },
    })

    await assert.rejects(call.promise, (e: ChannelRPCError) => {
      assert.equal(e.name, 'NotFoundError')
      assert.equal(e.message, 'no such branch')
      assert.equal(e.reason, 'remote')
      return true
    })
  })

  test('times out instead of hanging forever', async () => {
    const registry = new ChannelRPCRegistry(10)
    const call = registry.register()

    await assert.rejects(call.promise, (e: ChannelRPCError) => {
      assert.equal(e.reason, 'timeout')
      return true
    })
    assert.equal(registry.inFlight, 0, 'a timed out call is not leaked')
  })

  test('drops a late response for an already-timed-out call', async () => {
    const registry = new ChannelRPCRegistry(10)
    const call = registry.register()
    await assert.rejects(call.promise)

    const settled = registry.settle({
      action: CHANNEL_RPC_RESPONSE,
      id: call.id,
      ok: true,
      result: 'too late',
    })
    assert.equal(settled, false)
  })

  test('rejects every in-flight call when the channel drops', async () => {
    const registry = new ChannelRPCRegistry()
    const a = registry.register()
    const b = registry.register()

    registry.rejectAll('socket closed')

    for (const call of [a, b]) {
      await assert.rejects(call.promise, (e: ChannelRPCError) => {
        assert.equal(e.reason, 'closed')
        return true
      })
    }
    assert.equal(registry.inFlight, 0)
  })

  test('refuses to register a call on a closed registry', async () => {
    const registry = new ChannelRPCRegistry()
    registry.rejectAll()
    await assert.rejects(registry.register().promise, (e: ChannelRPCError) => {
      assert.equal(e.reason, 'closed')
      return true
    })
  })
})

describe('ChannelDeploymentService', () => {
  test('round-trips a call to a peer capability', async () => {
    const { service, serverSent } = connect({
      gitHead: async () => ({ sha: 'abc123' }),
    })

    const result = await service.invoke('gitHead', { cwd: '.' }, { userId: 'u1' }, 'trace-1')

    assert.deepEqual(result, { sha: 'abc123' })

    const request = serverSent[0] as ChannelRPCRequest
    assert.ok(isChannelRPCRequest(request))
    assert.equal(request.funcName, 'gitHead')
    assert.deepEqual(request.data, { cwd: '.' })
    assert.deepEqual(request.session, { userId: 'u1' }, 'session propagates')
    assert.equal(request.traceId, 'trace-1', 'traceId propagates')
  })

  test('keeps concurrent calls distinct', async () => {
    const { service } = connect({
      echo: async ({ value }: { value: string }) => {
        await new Promise((r) => setTimeout(r, value === 'slow' ? 20 : 1))
        return value
      },
    })

    const [slow, fast] = await Promise.all([
      service.invoke('echo', { value: 'slow' }),
      service.invoke('echo', { value: 'fast' }),
    ])

    assert.equal(slow, 'slow')
    assert.equal(fast, 'fast')
  })

  test('surfaces a thrown peer error to the caller', async () => {
    const { service } = connect({
      gitHead: () => {
        throw new Error('not a git repository')
      },
    })

    await assert.rejects(service.invoke('gitHead', {}), (e: Error) => {
      assert.match(e.message, /not a git repository/)
      return true
    })
  })

  test('refuses a capability the peer did not expose', async () => {
    const { service } = connect({ gitHead: () => 'ok' })

    await assert.rejects(service.invoke('readFile', { path: '/etc/passwd' }), (e: Error) => {
      assert.equal(e.name, 'RPCNotFoundError')
      assert.match(e.message, /Capability not exposed: readFile/)
      return true
    })
  })

  test('stop() fails in-flight calls', async () => {
    const pendingForever = new ChannelDeploymentService(() => {})
    const call = pendingForever.invoke('gitHead', {})
    await pendingForever.stop()
    await assert.rejects(call, (e: ChannelRPCError) => {
      assert.equal(e.reason, 'closed')
      return true
    })
  })
})

describe('createChannelRPCResponder', () => {
  test('ignores frames that are not RPC requests', async () => {
    const sent: unknown[] = []
    const respond = createChannelRPCResponder({
      capabilities: {},
      send: (d) => void sent.push(d),
    })

    assert.equal(await respond({ action: 'cli-control', event: 'complete' }), false)
    assert.equal(await respond('some rendered line'), false)
    assert.equal(sent.length, 0, 'non-RPC frames are left for the renderer')
  })
})
