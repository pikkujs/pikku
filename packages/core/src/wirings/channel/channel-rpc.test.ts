import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'

import { pikkuState } from '../../pikku-state.js'

import {
  CHANNEL_RPC_REQUEST,
  CHANNEL_RPC_RESPONSE,
  ChannelDeploymentService,
  ChannelRPCRegistry,
  createChannelRPCResponder,
  isChannelRPCRequest,
  isChannelRPCResponse,
  createChannelRPCResultValidator,
  type ChannelRPCError,
  type ChannelRPCRequest,
  type ChannelRPCResultValidator,
} from './channel-rpc.js'

/**
 * Wires a "server" ChannelDeploymentService to a "client" responder so the
 * pair round-trips in-process, standing in for the two ends of a socket.
 */
const connect = (
  capabilities: Record<string, (data: any) => any>,
  timeoutMs?: number,
  validateResult?: ChannelRPCResultValidator
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

  const service = new ChannelDeploymentService(
    async (data) => {
      serverSent.push(data)
      await respond(data)
    },
    { timeoutMs, validateResult }
  )

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
  test('init and start are no-ops — the socket is already open', async () => {
    const { service } = connect({})

    // Both exist only to satisfy `DeploymentService`. A deployed unit has to
    // be brought up; a connection that is already carrying the command has
    // nothing to bring up, and anything that calls these generically must not
    // fail against it.
    await service.init()
    await service.start()
  })

  test('round-trips a call to a peer capability', async () => {
    const { service, serverSent } = connect({
      gitHead: async () => ({ sha: 'abc123' }),
    })

    const result = await service.invoke(
      'gitHead',
      { cwd: '.' },
      { userId: 'u1' },
      'trace-1'
    )

    assert.deepEqual(result, { sha: 'abc123' })

    const request = serverSent[0] as ChannelRPCRequest
    assert.ok(isChannelRPCRequest(request))
    assert.equal(request.funcName, 'gitHead')
    assert.deepEqual(request.data, { cwd: '.' })
    assert.equal(request.traceId, 'trace-1', 'traceId propagates')
    // The peer runs the capability as itself, on its own machine, under its
    // own identity. Sending the caller's session would hand it credentials it
    // has no use for and that authorise nothing on its side.
    assert.equal(
      'session' in (request as Record<string, unknown>),
      false,
      'the caller session is not put on the wire'
    )
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

    await assert.rejects(
      service.invoke('readFile', { path: '/etc/passwd' }),
      (e: Error) => {
        assert.equal(e.name, 'RPCNotFoundError')
        assert.match(e.message, /Capability not exposed: readFile/)
        return true
      }
    )
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

    assert.equal(
      await respond({ action: 'cli-control', event: 'complete' }),
      false
    )
    assert.equal(await respond('some rendered line'), false)
    assert.equal(sent.length, 0, 'non-RPC frames are left for the renderer')
  })
})

describe('envelope validation', () => {
  test('a request is only accepted with a usable id and funcName', () => {
    const valid = {
      action: CHANNEL_RPC_REQUEST,
      id: '1',
      funcName: 'gitHead',
      data: {},
    }
    assert.equal(isChannelRPCRequest(valid), true)
    assert.equal(isChannelRPCRequest({ ...valid, traceId: 'trace-1' }), true)

    // Every one of these is tagged as an RPC request and would previously have
    // passed, reaching a capability lookup with a name of the wrong type.
    for (const frame of [
      { ...valid, id: 1 },
      { ...valid, id: '' },
      { ...valid, id: undefined },
      { ...valid, funcName: {} },
      { ...valid, funcName: '' },
      { ...valid, funcName: undefined },
      { ...valid, traceId: 42 },
      { action: CHANNEL_RPC_REQUEST },
    ]) {
      assert.equal(
        isChannelRPCRequest(frame),
        false,
        `expected rejection of ${JSON.stringify(frame)}`
      )
    }
  })

  test('a response is only accepted with a usable id and ok flag', () => {
    const valid = { action: CHANNEL_RPC_RESPONSE, id: '1', ok: true }
    assert.equal(isChannelRPCResponse(valid), true)

    for (const frame of [
      { ...valid, id: 7 },
      { ...valid, id: '' },
      { ...valid, ok: 'yes' },
      { ...valid, ok: undefined },
      { action: CHANNEL_RPC_RESPONSE },
      null,
      'a rendered line',
    ]) {
      assert.equal(
        isChannelRPCResponse(frame),
        false,
        `expected rejection of ${JSON.stringify(frame)}`
      )
    }
  })

  test('a malformed failure payload does not reach the caller as-is', async () => {
    const registry = new ChannelRPCRegistry()
    const { id, promise } = registry.register()

    // A peer is free to answer with anything. Without the fallback, `name`
    // lands on an Error as a non-string and `message` stringifies as
    // "[object Object]" in whatever logs it.
    registry.settle({
      action: CHANNEL_RPC_RESPONSE,
      id,
      ok: false,
      error: { name: 42, message: { nested: true } } as any,
    })

    await assert.rejects(promise, (e: ChannelRPCError) => {
      assert.equal(e.name, 'ChannelRPCError')
      assert.equal(e.message, 'Remote channel RPC failed')
      assert.equal(e.reason, 'remote')
      return true
    })
  })
})

describe('result validation', () => {
  /**
   * Registers a capability the way codegen would: a name in the RPC map, the
   * function it resolves to, and the schema generated from its return type.
   */
  const declareCapability = (name: string, schema: unknown) => {
    pikkuState(null, 'rpc', 'meta')[name] = name as any
    pikkuState(null, 'function', 'meta')[name] = {
      pikkuFuncId: name,
      outputSchemaName: `${name}Output`,
    } as any
    pikkuState(null, 'misc', 'schemas').set(`${name}Output`, schema as any)
    return () => {
      delete pikkuState(null, 'rpc', 'meta')[name]
      delete pikkuState(null, 'function', 'meta')[name]
      pikkuState(null, 'misc', 'schemas').delete(`${name}Output`)
    }
  }

  const checkoutSchema = {
    type: 'object',
    properties: { sha: { type: 'string' }, branch: { type: 'string' } },
    required: ['sha', 'branch'],
  }

  /** Stands in for the schema service, which is an ajv wrapper in production. */
  const schemaServices = () => ({
    logger: {
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {},
    },
    schema: {
      compileSchema: () => {},
      validateSchema: (name: string, data: any) => {
        const schema = pikkuState(null, 'misc', 'schemas').get(name) as any
        for (const key of schema?.required ?? []) {
          if (typeof data?.[key] !== schema.properties[key].type) {
            throw new Error(`Property "${key}" does not match schema.`)
          }
        }
      },
    },
  })

  test('accepts an answer matching the declared return type', async () => {
    const release = declareCapability('localCheckout', checkoutSchema)
    try {
      const { service } = connect(
        { localCheckout: () => ({ sha: 'deadbeef', branch: 'main' }) },
        undefined,
        createChannelRPCResultValidator(schemaServices() as any)
      )

      assert.deepEqual(await service.invoke('localCheckout', {}), {
        sha: 'deadbeef',
        branch: 'main',
      })
    } finally {
      release()
    }
  })

  test('rejects an answer that does not match, naming the capability', async () => {
    const release = declareCapability('localCheckout', checkoutSchema)
    try {
      // A client on an older build, or one that simply lies. Either way the
      // command must not carry on with a `sha` that is not a string.
      const { service } = connect(
        { localCheckout: () => ({ sha: null, branch: 'main' }) },
        undefined,
        createChannelRPCResultValidator(schemaServices() as any)
      )

      await assert.rejects(
        service.invoke('localCheckout', {}),
        (e: ChannelRPCError) => {
          assert.equal(e.reason, 'invalid')
          assert.match(
            e.message,
            /Invalid result from "localCheckout": Property "sha" does not match schema\./
          )
          return true
        }
      )
    } finally {
      release()
    }
  })

  test('leaves a capability with no declared contract alone', async () => {
    // Nothing was declared for this name, so there is no shape to check
    // against — inventing a failure would break a caller that deliberately
    // treats the answer as opaque.
    const { service } = connect(
      { whoAmI: () => 'anything at all' },
      undefined,
      createChannelRPCResultValidator(schemaServices() as any)
    )

    assert.equal(await service.invoke('whoAmI', {}), 'anything at all')
  })

  test('a failure inside the capability is not reported as invalid', async () => {
    const release = declareCapability('localCheckout', checkoutSchema)
    try {
      const { service } = connect(
        {
          localCheckout: () => {
            throw new Error('not a git repository')
          },
        },
        undefined,
        createChannelRPCResultValidator(schemaServices() as any)
      )

      // The peer answered properly — it answered that it failed. Calling that
      // a validation problem would point at the wrong end of the connection.
      await assert.rejects(
        service.invoke('localCheckout', {}),
        (e: ChannelRPCError) => {
          assert.equal(e.reason, 'remote')
          assert.equal(e.message, 'not a git repository')
          return true
        }
      )
    } finally {
      release()
    }
  })
})
