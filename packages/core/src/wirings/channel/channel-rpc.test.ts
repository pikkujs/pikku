import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'

import { pikkuState } from '../../pikku-state.js'

import {
  CHANNEL_RPC_PENDING,
  CHANNEL_RPC_REQUEST,
  CHANNEL_RPC_RESPONSE,
  ChannelDeploymentService,
  ChannelRPCRegistry,
  createChannelRPCResponder,
  isChannelRPCRequest,
  isChannelRPCResponse,
  createChannelRPCInputValidator,
  createChannelRPCResultValidator,
  unsupportedChannelRemote,
  type ChannelRPCError,
  type ChannelRPCRequest,
  type ChannelRPCResponse,
  type ChannelRPCValidator,
} from './channel-rpc.js'

/**
 * Wires a "server" ChannelDeploymentService to a "client" responder so the
 * pair round-trips in-process, standing in for the two ends of a socket.
 */
const connect = (
  capabilities: Record<string, (data: any) => any>,
  timeoutMs?: number,
  validateResult?: ChannelRPCValidator,
  validateInput?: ChannelRPCValidator
) => {
  const clientSent: unknown[] = []
  const serverSent: unknown[] = []

  // These tests are about the transport, so their capabilities are declared
  // safe rather than left unclassified — an unclassified one is refused before
  // it reaches any of the machinery under test here.
  const classified = Object.fromEntries(
    Object.entries(capabilities).map(([name, execute]) => [
      name,
      { execute, needsApproval: false },
    ])
  )

  const respond = createChannelRPCResponder({
    capabilities: classified,
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
    { timeoutMs, validateResult, validateInput }
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

  test('hold stops the clock while a human is being asked', async () => {
    const registry = new ChannelRPCRegistry(10)
    const call = registry.register()

    assert.equal(registry.hold(call.id), true)

    // Comfortably past the timeout the call was registered with. Without the
    // hold this is the point at which a prompt still on someone's screen has
    // already failed the command.
    await new Promise((r) => setTimeout(r, 40))
    assert.equal(registry.inFlight, 1, 'the call is still waiting')

    registry.settle({
      action: CHANNEL_RPC_RESPONSE,
      id: call.id,
      ok: true,
      result: 'approved and done',
    })
    assert.equal(await call.promise, 'approved and done')
  })

  test('a held call still fails the moment the socket drops', async () => {
    const registry = new ChannelRPCRegistry(10)
    const call = registry.register()
    registry.hold(call.id)

    // Holding removes the timer, so this is the only thing left that can fail
    // the call — and it is the one that matches reality, because a peer that
    // dies mid-prompt takes the connection with it.
    registry.rejectAll('socket closed')

    await assert.rejects(call.promise, (e: ChannelRPCError) => {
      assert.equal(e.reason, 'closed')
      return true
    })
  })

  test('hold is ignored for an unknown or already-held call', async () => {
    const registry = new ChannelRPCRegistry()
    const call = registry.register()

    assert.equal(registry.hold('does-not-exist'), false)
    assert.equal(registry.hold(call.id), true)
    assert.equal(registry.hold(call.id), false, 'holding twice changes nothing')

    registry.rejectAll()
    await assert.rejects(call.promise)
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

  test('a failed send does not leave a call nobody is waiting on', async () => {
    const service = new ChannelDeploymentService(() => {
      throw new Error('socket is closed')
    })

    await assert.rejects(service.invoke('gitHead', {}), (e: Error) => {
      assert.match(e.message, /socket is closed/)
      return true
    })

    // The call is registered before the request goes out. If the send fails
    // and the entry stays, its timeout fires later against a promise nothing
    // holds — which Node reports as an unhandled rejection, from a call the
    // caller already saw fail.
    assert.equal(
      (service as unknown as { registry: { inFlight: number } }).registry
        .inFlight,
      0,
      'the failed call is retired rather than left to time out'
    )
  })

  test('a call on a stopped service does not reach the wire', async () => {
    const sent: unknown[] = []
    const service = new ChannelDeploymentService((data) => {
      sent.push(data)
    })
    await service.stop()

    await assert.rejects(
      service.invoke('gitHead', {}),
      (e: ChannelRPCError) => {
        assert.equal(e.reason, 'closed')
        return true
      }
    )
    assert.deepEqual(sent, [], 'nothing is written to a channel already gone')
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

describe('unsupportedChannelRemote', () => {
  test('refuses immediately rather than waiting for an answer that cannot come', async () => {
    await assert.rejects(
      unsupportedChannelRemote('localCheckout'),
      (e: ChannelRPCError) => {
        assert.equal(e.reason, 'unsupported')
        assert.match(e.message, /localCheckout/)
        return true
      }
    )
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

  test('an unclassified capability is not run without approval', async () => {
    const sent: ChannelRPCResponse[] = []
    let ran = false
    // No approver: there is nobody to ask. A bare function carries no policy,
    // which resolves to needing one — the annotation nobody wrote is the one
    // most likely to matter, so it fails closed.
    const respond = createChannelRPCResponder({
      capabilities: {
        localPush: () => {
          ran = true
          return 'pushed'
        },
      },
      send: (d) => void sent.push(d as ChannelRPCResponse),
    })

    await respond({
      action: CHANNEL_RPC_REQUEST,
      id: '1',
      funcName: 'localPush',
      data: {},
    })

    assert.equal(ran, false, 'the capability must not have run')
    assert.equal(sent[0]?.ok, false)
    assert.equal(sent[0]?.error?.name, 'RPCNotApprovedError')
  })

  test('a capability classified safe runs without asking', async () => {
    const sent: ChannelRPCResponse[] = []
    const respond = createChannelRPCResponder({
      capabilities: {
        gitHead: { execute: () => ({ sha: 'abc' }), needsApproval: false },
      },
      send: (d) => void sent.push(d as ChannelRPCResponse),
    })

    await respond({
      action: CHANNEL_RPC_REQUEST,
      id: '1',
      funcName: 'gitHead',
      data: {},
    })

    assert.equal(sent.length, 1, 'nothing was asked, so nothing was held')
    assert.equal(sent[0]?.ok, true)
    assert.deepEqual(sent[0]?.result, { sha: 'abc' })
  })

  test('an approved call holds the caller clock, then runs', async () => {
    const sent: unknown[] = []
    const asked: unknown[] = []
    const respond = createChannelRPCResponder({
      capabilities: {
        localPush: {
          execute: () => 'pushed',
          needsApproval: true,
          approvalDescriptionFn: ({ tag }: any) => `push tag ${tag} to origin`,
        },
      },
      send: (d) => void sent.push(d),
      approve: (request) => {
        asked.push(request)
        return true
      },
    })

    await respond({
      action: CHANNEL_RPC_REQUEST,
      id: '1',
      funcName: 'localPush',
      data: { tag: 'v2.1.0' },
    })

    // The hold has to go out before the human is asked. Sent afterwards it
    // races the caller's timeout, and an answer past the timeout is dropped —
    // the decision would be taken and then silently thrown away.
    assert.deepEqual(sent[0], {
      action: CHANNEL_RPC_PENDING,
      id: '1',
      reason: 'push tag v2.1.0 to origin',
    })
    assert.deepEqual(asked, [
      {
        funcName: 'localPush',
        data: { tag: 'v2.1.0' },
        description: 'push tag v2.1.0 to origin',
      },
    ])
    assert.equal((sent[1] as ChannelRPCResponse).result, 'pushed')
  })

  test('a refusal is an answer, not a hang', async () => {
    const sent: unknown[] = []
    let ran = false
    const respond = createChannelRPCResponder({
      capabilities: {
        localPush: {
          execute: () => {
            ran = true
            return 'pushed'
          },
          needsApproval: true,
        },
      },
      send: (d) => void sent.push(d),
      approve: () => false,
    })

    await respond({
      action: CHANNEL_RPC_REQUEST,
      id: '1',
      funcName: 'localPush',
      data: {},
    })

    assert.equal(ran, false)
    const response = sent[sent.length - 1] as ChannelRPCResponse
    assert.equal(response.ok, false)
    assert.equal(response.error?.name, 'RPCDeniedError')
  })

  test('a name inherited from Object.prototype is not a capability', async () => {
    const sent: ChannelRPCResponse[] = []
    const respond = createChannelRPCResponder({
      capabilities: { gitHead: () => 'ok' },
      send: (d) => void sent.push(d as ChannelRPCResponse),
    })

    // The map is an object, so `capabilities['toString']` resolves a real
    // function. Calling it would run code on the peer's machine under a name
    // the peer never listed — the map is the authorisation boundary, and
    // reaching past it through the prototype chain has to refuse like any
    // other unknown name.
    for (const funcName of ['toString', 'valueOf', 'constructor']) {
      await respond({
        action: CHANNEL_RPC_REQUEST,
        id: funcName,
        funcName,
        data: {},
      })
    }

    assert.equal(sent.length, 3)
    for (const response of sent) {
      assert.equal(response.ok, false)
      assert.equal(response.error?.name, 'RPCNotFoundError')
    }
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

describe('input validation', () => {
  /** As codegen would declare it: a name, its function, its argument schema. */
  const declareInput = (name: string, schema: unknown) => {
    pikkuState(null, 'rpc', 'meta')[name] = name as any
    pikkuState(null, 'function', 'meta')[name] = {
      pikkuFuncId: name,
      inputSchemaName: `${name}Input`,
    } as any
    pikkuState(null, 'misc', 'schemas').set(`${name}Input`, schema as any)
    return () => {
      delete pikkuState(null, 'rpc', 'meta')[name]
      delete pikkuState(null, 'function', 'meta')[name]
      pikkuState(null, 'misc', 'schemas').delete(`${name}Input`)
    }
  }

  const pathSchema = {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
  }

  const validator = (): ChannelRPCValidator =>
    createChannelRPCInputValidator(schemaServices() as any)

  test('arguments that do not match the declared input fail before the send', async () => {
    const release = declareInput('readLocalFile', pathSchema)
    try {
      const { service, serverSent } = connect(
        { readLocalFile: () => 'contents' },
        undefined,
        undefined,
        validator()
      )

      await assert.rejects(
        service.invoke('readLocalFile', { path: 42 }),
        (e: ChannelRPCError) => {
          assert.equal(e.reason, 'invalid')
          assert.match(
            e.message,
            /Invalid arguments for "readLocalFile": Property "path" does not match schema\./
          )
          return true
        }
      )

      // Nothing went out. This is version drift, not an attack — the peer must
      // still check what it is handed — but failing here names the end that
      // got it wrong instead of surfacing inside someone else's process.
      assert.deepEqual(serverSent, [])
      assert.equal(service.registry.inFlight, 0, 'no call is left registered')
    } finally {
      release()
    }
  })

  test('matching arguments go out untouched', async () => {
    const release = declareInput('readLocalFile', pathSchema)
    try {
      const { service } = connect(
        { readLocalFile: ({ path }: any) => `contents of ${path}` },
        undefined,
        undefined,
        validator()
      )

      assert.equal(
        await service.invoke('readLocalFile', { path: '/etc/hosts' }),
        'contents of /etc/hosts'
      )
    } finally {
      release()
    }
  })

  test('a capability with no declared input is left alone', async () => {
    const { service } = connect(
      { whoAmI: () => 'me' },
      undefined,
      undefined,
      validator()
    )

    assert.equal(await service.invoke('whoAmI', { anything: true }), 'me')
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
